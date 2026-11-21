import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import multer from 'multer';
import exifr from 'exifr';
import dotenv from 'dotenv';
import { z } from 'zod';
import { GoogleGenAI, Type } from '@google/genai';
import { initializeApp as initializeAdminApp, getApps as getAdminApps, getApp as getAdminApp } from 'firebase-admin/app';
import { getAuth as getAdminAuth, DecodedIdToken } from 'firebase-admin/auth';

dotenv.config();

const PORT = Number(process.env.PORT || 3000);
const IS_PROD = process.env.NODE_ENV === 'production';

// Load Firebase project ID strictly from provisioned firebase-applet-config.json
const firebaseConfigPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
let firebaseProjectId = '';
if (fs.existsSync(firebaseConfigPath)) {
  try {
    const parsed = JSON.parse(fs.readFileSync(firebaseConfigPath, 'utf-8'));
    if (parsed?.projectId && parsed.projectId !== 'remixed-project-id') {
      firebaseProjectId = parsed.projectId;
    }
  } catch (err) {
    console.error('Failed to parse firebase-applet-config.json:', err);
  }
}

// Initialize Firebase Admin ONLY for verifyIdToken (requires zero IAM; works on Starter Tier)
if (firebaseProjectId) {
  if (!getAdminApps().length) {
    initializeAdminApp({ projectId: firebaseProjectId });
  } else {
    getAdminApp();
  }
}

// Shared server-side Gemini client
function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    throw new Error('GEMINI_API_KEY is not configured in server environment secrets.');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

// Confined server-side evidence storage directory
const EVIDENCE_DIR = path.resolve(process.cwd(), 'uploads', 'evidence');
const HASH_INDEX_PATH = path.resolve(EVIDENCE_DIR, '.hash-index.json');
fs.mkdirSync(EVIDENCE_DIR, { recursive: true });

interface HashIndexEntry {
  fileName: string;
  uploadedAt: string;
  uploaderUid: string;
}

function readHashIndex(): Record<string, HashIndexEntry> {
  try {
    if (!fs.existsSync(HASH_INDEX_PATH)) return {};
    return JSON.parse(fs.readFileSync(HASH_INDEX_PATH, 'utf-8')) as Record<string, HashIndexEntry>;
  } catch {
    return {};
  }
}

function writeHashIndex(index: Record<string, HashIndexEntry>): void {
  fs.writeFileSync(HASH_INDEX_PATH, JSON.stringify(index, null, 2), 'utf-8');
}

function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

// Detect image magic bytes to prevent MIME spoofing
function detectImageExtension(buf: Buffer): { ext: string; mime: string } | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return { ext: '.jpg', mime: 'image/jpeg' };
  }
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    return { ext: '.png', mime: 'image/png' };
  }
  if (
    buf.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buf.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return { ext: '.webp', mime: 'image/webp' };
  }
  return null;
}

interface AuthedRequest extends Request {
  user?: DecodedIdToken;
}

// Strict Firebase ID Token Verification Middleware
async function verifyAuth(req: AuthedRequest, res: Response, next: NextFunction): Promise<void> {
  if (!firebaseProjectId) {
    res.status(503).json({ error: 'Firebase project is not provisioned.' });
    return;
  }
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authentication required. Provide a valid Bearer ID token.' });
    return;
  }
  const token = authHeader.slice(7).trim();
  if (!token) {
    res.status(401).json({ error: 'Empty authorization token.' });
    return;
  }
  try {
    const decoded = await getAdminAuth().verifyIdToken(token);
    if (!decoded.email_verified) {
      res.status(403).json({ error: 'Verified email address is required to access CivicAI APIs.' });
      return;
    }
    req.user = decoded;
    next();
  } catch (err) {
    console.error('Firebase token verification failed:', err instanceof Error ? err.message : err);
    res.status(401).json({ error: 'Invalid or expired Firebase authentication token.' });
  }
}

// Multer in-memory upload with strict 8MB limit
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 8 * 1024 * 1024,
    files: 1,
  },
});

// ── Deterministic EmergencyGuard Baseline Rules ──────────────────────────────
interface DeterministicRule {
  ruleCode: string;
  name: string;
  keywords: string[];
  taxonomyCodes: string[];
  severity: 'Critical' | 'High';
  ackWindowMinutes: number;
}

const BASELINE_EMERGENCY_RULES: DeterministicRule[] = [
  {
    ruleCode: 'EMG-LIFE-ELEC',
    name: 'Live Exposed Wire / Electrocution Hazard',
    keywords: [
      'electrocution', 'live wire', 'high voltage', 'electric shock', 'sparking wire', 'fallen wire',
      'बिजली का तार', 'करंट', 'மின் கம்பி', 'విద్యుత్ తీగ', 'ವಿದ್ಯುತ್ ತಂತಿ', 'वीज तार',
    ],
    taxonomyCodes: ['ELC-WIR-001', 'ELC-TRF-002'],
    severity: 'Critical',
    ackWindowMinutes: 10,
  },
  {
    ruleCode: 'EMG-LIFE-ACC',
    name: 'Active Road Accident / Collision / Injury',
    keywords: [
      'accident', 'crash', 'collision', 'injured', 'bleeding', 'hit and run', 'trapped', 'casualty',
      'दुर्घटना', 'एक्सीडेंट', 'घायल', 'விபத்து', 'ప్రమాదం', 'ಅಪಘಾತ', 'अपघात',
    ],
    taxonomyCodes: ['TRF-ACC-001'],
    severity: 'Critical',
    ackWindowMinutes: 10,
  },
  {
    ruleCode: 'EMG-LIFE-COLLAPSE',
    name: 'Structural Collapse / Open Deep Manhole / Sinkhole',
    keywords: [
      'collapse', 'collapsed', 'sinkhole', 'open manhole', 'uncovered manhole', 'bridge collapse', 'wall fell', 'building crack',
      'गिर गया', 'मैनहोल खुला', 'गड्ढे में गिरा', 'கட்டிடம் இடிந்தது', 'కూలిపోయింది',
    ],
    taxonomyCodes: ['STR-COL-001', 'DRN-MNH-001', 'RDS-SNK-002'],
    severity: 'Critical',
    ackWindowMinutes: 15,
  },
  {
    ruleCode: 'EMG-LIFE-FIRE-GAS',
    name: 'Gas Leak / Fire / Explosion Hazard',
    keywords: [
      'gas leak', 'fire', 'explosion', 'burning', 'toxic smoke', 'chemical spill', 'cylinder leak',
      'आग', 'गैस लीक', 'धमाका', 'தீ', 'வாயு கசிவு', 'అగ్ని', 'గ్యాస్ లీక్',
    ],
    taxonomyCodes: ['FIR-GAS-001', 'FIR-HZD-002'],
    severity: 'Critical',
    ackWindowMinutes: 10,
  },
  {
    ruleCode: 'EMG-LIFE-FLOOD',
    name: 'Severe Flash Flooding / Submerged Road Rescue Risk',
    keywords: [
      'drowning', 'flash flood', 'submerged vehicle', 'water entering house', 'sewage burst',
      'बाढ़', 'डूब', 'வெள்ளம்', 'వరద',
    ],
    taxonomyCodes: ['DRN-FLD-001'],
    severity: 'Critical',
    ackWindowMinutes: 15,
  },
];

function evaluateDeterministicEmergency(
  rawText: string,
  translatedText: string,
  customRules: DeterministicRule[],
  classifiedCodes: string[]
): { triggered: boolean; severity: 'Critical' | 'High' | null; matchedRules: DeterministicRule[] } {
  const combined = `${rawText} ${translatedText}`.toLowerCase();
  const allRules = [...BASELINE_EMERGENCY_RULES, ...customRules];
  const matchedMap = new Map<string, DeterministicRule>();

  for (const rule of allRules) {
    const keywordMatch = rule.keywords.some((kw) => kw.trim().length >= 2 && combined.includes(kw.toLowerCase()));
    const codeMatch = rule.taxonomyCodes.some((c) => classifiedCodes.includes(c));
    if (keywordMatch || codeMatch) {
      matchedMap.set(rule.ruleCode, rule);
    }
  }

  const matchedRules = Array.from(matchedMap.values());
  if (matchedRules.length === 0) {
    return { triggered: false, severity: null, matchedRules: [] };
  }
  const hasCritical = matchedRules.some((r) => r.severity === 'Critical');
  return {
    triggered: true,
    severity: hasCritical ? 'Critical' : 'High',
    matchedRules,
  };
}

// ── Zod Schemas for Request & Gemini Output Validation ───────────────────────
const InspectComplaintRequestSchema = z.object({
  rawText: z.string().min(5).max(4000),
  language: z.enum(['en', 'hi', 'ta', 'te', 'kn', 'mr', 'bn', 'gu']).default('en'),
  landmark: z.string().max(300).optional().default(''),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  evidenceFiles: z
    .array(
      z.object({
        storageFileName: z.string().regex(/^[a-f0-9\-]+\.(jpg|jpeg|png|webp)$/),
        mimeType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
        sha256: z.string().length(64),
      })
    )
    .max(5)
    .optional()
    .default([]),
  taxonomyCatalog: z
    .array(
      z.object({
        code: z.string(),
        domain: z.string(),
        category: z.string(),
        subcategory: z.string(),
        department: z.string(),
        defaultSeverity: z.enum(['Critical', 'High', 'Medium', 'Low']),
        emergencyTrigger: z.boolean(),
      })
    )
    .max(100)
    .optional()
    .default([]),
  emergencyRules: z
    .array(
      z.object({
        ruleCode: z.string(),
        name: z.string(),
        keywords: z.array(z.string()),
        taxonomyCodes: z.array(z.string()),
        severity: z.enum(['Critical', 'High']),
        ackWindowMinutes: z.number().int().min(1).max(180),
      })
    )
    .max(50)
    .optional()
    .default([]),
});

const GeminiInspectionOutputSchema = z.object({
  detectedLanguage: z.string().min(2).max(40),
  englishTranslation: z.string().min(2).max(4000),
  englishSummary: z.string().min(2).max(2000),
  observations: z.string().max(3000),
  recommendedSeverity: z.enum(['Critical', 'High', 'Medium', 'Low']),
  emergencyFlag: z.boolean(),
  emergencyReason: z.string().max(1000),
  imageObservations: z.string().max(2000),
  suspiciousVisualFlags: z.array(z.string().max(300)).max(15),
  classifiedIssues: z
    .array(
      z.object({
        canonicalCode: z.string().min(2).max(40),
        domain: z.string().min(2).max(80),
        category: z.string().min(2).max(100),
        subcategory: z.string().min(2).max(120),
        department: z.string().min(2).max(120),
        description: z.string().min(2).max(1000),
        recommendedSeverity: z.enum(['Critical', 'High', 'Medium', 'Low']),
        confidence: z.number().min(0).max(1),
      })
    )
    .min(1)
    .max(10),
});

const TwinTrustRequestSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  offices: z
    .array(
      z.object({
        id: z.string(),
        officeCode: z.string(),
        officeName: z.string(),
        department: z.string(),
        wardId: z.string(),
        wardName: z.string(),
        latitude: z.number(),
        longitude: z.number(),
        minLat: z.number(),
        maxLat: z.number(),
        minLng: z.number(),
        maxLng: z.number(),
        primaryOfficerUid: z.string(),
        primaryOfficerName: z.string(),
        backupOfficerUid: z.string(),
        backupOfficerName: z.string(),
        inspectorUid: z.string(),
        inspectorName: z.string(),
      })
    )
    .max(200)
    .default([]),
  hotspots: z
    .array(
      z.object({
        id: z.string(),
        recordCode: z.string(),
        locationName: z.string(),
        roadName: z.string(),
        latitude: z.number(),
        longitude: z.number(),
        incidentCount: z.number(),
        fatalities: z.number(),
        injuries: z.number(),
        sourceDataset: z.string(),
      })
    )
    .max(500)
    .default([]),
});

const EmergencyNotifySchema = z.object({
  complaintId: z.string().regex(/^[a-zA-Z0-9_\-]+$/),
  incidentId: z.string().regex(/^[a-zA-Z0-9_\-]+$/),
  severity: z.enum(['Critical', 'High']),
  title: z.string().min(3).max(240),
  wardName: z.string().max(120),
  ackWindowMinutes: z.number().int().min(1).max(180).default(15),
});

async function startServer() {
  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json({ limit: '5mb' }));

  // ── 1. Health & Integration Readiness Endpoint ─────────────────────────────
  app.get('/api/health', (_req: Request, res: Response) => {
    const geminiConfigured = Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'MY_GEMINI_API_KEY');
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      integrations: {
        geminiAi: {
          configured: geminiConfigured,
          model: 'gemini-4-hydrogen',
          mode: 'server-side',
        },
        firebaseAuthAndFirestore: {
          configured: Boolean(firebaseProjectId),
          projectId: firebaseProjectId || null,
          mode: 'provisioned-client-sdk-with-hardened-rules',
        },
        evidenceStorage: {
          configured: true,
          mode: 'server-side-protected-storage',
          note: 'Photos are hashed (SHA-256), EXIF-analyzed, and stored in authenticated server storage. To migrate blobs to Firebase Storage, enable Storage rules in Firebase Console.',
        },
        openStreetMapTwinTrust: {
          configured: true,
          mode: 'leaflet-osm-nominatim-plus-csv-wards',
        },
        fcmPush: {
          configured: Boolean(process.env.VITE_FCM_VAPID_KEY),
          note: process.env.VITE_FCM_VAPID_KEY
            ? 'FCM VAPID key configured alongside Firestore real-time notifications.'
            : 'Firestore real-time in-app notifications are active. Add VITE_FCM_VAPID_KEY from Firebase Console to enable background web push.',
        },
        cloudTasks: {
          configured: false,
          note: 'Server-side deadline tracking and backup escalation workflow are active. Google Cloud Tasks requires a billing-enabled GCP project with Cloud Tasks API enabled.',
        },
        emergencyDispatch112: {
          configured: false,
          note: 'CivicAI routes Critical incidents to authorized municipal officers and displays Call 112 guidance. Direct 112 emergency dispatch is never simulated without an official government integration.',
        },
      },
    });
  });

  // ── 2. ImageGuard Evidence Upload & Forensic Metadata Analysis ─────────────
  app.post('/api/evidence/upload', verifyAuth, upload.single('file'), async (req: AuthedRequest, res: Response) => {
    try {
      const file = req.file;
      if (!file) {
        res.status(400).json({ error: 'No image file provided.' });
        return;
      }

      const detected = detectImageExtension(file.buffer);
      if (!detected) {
        res.status(400).json({ error: 'Unsupported or invalid image file. Allowed formats: JPEG, PNG, WebP.' });
        return;
      }

      const submittedLat = req.body.latitude !== undefined ? Number(req.body.latitude) : NaN;
      const submittedLng = req.body.longitude !== undefined ? Number(req.body.longitude) : NaN;
      let clientKnownHashes: string[] = [];
      if (typeof req.body.knownHashes === 'string' && req.body.knownHashes.length > 0) {
        try {
          const parsed = JSON.parse(req.body.knownHashes);
          if (Array.isArray(parsed)) {
            clientKnownHashes = parsed.filter((h): h is string => typeof h === 'string' && h.length === 64);
          }
        } catch {
          // ignore invalid knownHashes JSON
        }
      }

      // Compute cryptographic SHA-256 digest
      const sha256 = crypto.createHash('sha256').update(file.buffer).digest('hex');

      // Check duplicate against server hash index & client-provided hashes
      const hashIndex = readHashIndex();
      const existingEntry = hashIndex[sha256];
      const isDuplicate = Boolean(existingEntry) || clientKnownHashes.includes(sha256);
      const duplicateOfFileName = existingEntry?.fileName || '';

      // Extract EXIF metadata safely
      let exifCamera = '';
      let exifTimestamp = '';
      let exifSoftware = '';
      let exifGpsLat = 0;
      let exifGpsLng = 0;
      let hasExifGps = false;
      let gpsMismatchMeters = 0;

      try {
        const exifData = await exifr.parse(file.buffer, {
          tiff: true,
          exif: true,
          gps: true,
        });
        if (exifData) {
          const make = typeof exifData.Make === 'string' ? exifData.Make.trim() : '';
          const model = typeof exifData.Model === 'string' ? exifData.Model.trim() : '';
          exifCamera = [make, model].filter(Boolean).join(' ').slice(0, 180);

          if (exifData.Software && typeof exifData.Software === 'string') {
            exifSoftware = exifData.Software.trim().slice(0, 120);
          }

          const rawDate = exifData.DateTimeOriginal || exifData.CreateDate || exifData.ModifyDate;
          if (rawDate instanceof Date && !Number.isNaN(rawDate.getTime())) {
            exifTimestamp = rawDate.toISOString();
          } else if (typeof rawDate === 'string') {
            exifTimestamp = rawDate.slice(0, 64);
          }

          if (
            typeof exifData.latitude === 'number' &&
            typeof exifData.longitude === 'number' &&
            !Number.isNaN(exifData.latitude) &&
            !Number.isNaN(exifData.longitude)
          ) {
            exifGpsLat = Number(exifData.latitude.toFixed(6));
            exifGpsLng = Number(exifData.longitude.toFixed(6));
            hasExifGps = true;
            if (!Number.isNaN(submittedLat) && !Number.isNaN(submittedLng)) {
              gpsMismatchMeters = haversineMeters(exifGpsLat, exifGpsLng, submittedLat, submittedLng);
            }
          }
        }
      } catch {
        // EXIF not present or unreadable — handled cleanly below
      }

      // Deterministic ImageGuard checks (advisory flagging for human review)
      const suspiciousReasons: string[] = [];
      if (isDuplicate) {
        suspiciousReasons.push('Exact SHA-256 duplicate of a previously uploaded evidence photograph.');
      }
      if (exifSoftware && /photoshop|gimp|lightroom|canva|snapseed|midjourney|stable\s*diffusion|dall/i.test(exifSoftware)) {
        suspiciousReasons.push(`Editing or generation software tag detected in EXIF metadata (${exifSoftware}).`);
      }
      if (hasExifGps && gpsMismatchMeters > 500) {
        suspiciousReasons.push(`EXIF GPS differs from complaint location by ${gpsMismatchMeters} meters (>500m threshold).`);
      }
      if (exifTimestamp) {
        const parsedTime = Date.parse(exifTimestamp);
        if (!Number.isNaN(parsedTime)) {
          const ageDays = Math.floor((Date.now() - parsedTime) / (1000 * 60 * 60 * 24));
          if (ageDays > 30) {
            suspiciousReasons.push(`EXIF capture timestamp is ${ageDays} days old (>30 days).`);
          } else if (ageDays < -1) {
            suspiciousReasons.push('EXIF capture timestamp appears to be set in the future.');
          }
        }
      }
      if (!exifCamera && !exifTimestamp && !hasExifGps) {
        suspiciousReasons.push('No EXIF camera or GPS metadata found (common for screenshots or forwarded images; verify on-site).');
      }

      const suspiciousFlag = suspiciousReasons.length > 0;

      // Save file strictly inside confined EVIDENCE_DIR
      const storageFileName = `${crypto.randomUUID()}${detected.ext}`;
      const targetPath = path.resolve(EVIDENCE_DIR, storageFileName);
      if (!targetPath.startsWith(EVIDENCE_DIR + path.sep)) {
        res.status(400).json({ error: 'Invalid storage path.' });
        return;
      }
      fs.writeFileSync(targetPath, file.buffer);

      if (!hashIndex[sha256]) {
        hashIndex[sha256] = {
          fileName: storageFileName,
          uploadedAt: new Date().toISOString(),
          uploaderUid: req.user?.uid || 'unknown',
        };
        writeHashIndex(hashIndex);
      }

      res.json({
        storageFileName,
        storageUrl: `/api/evidence/file/${storageFileName}`,
        storageType: 'server_local',
        originalName: (file.originalname || storageFileName).slice(0, 180),
        mimeType: detected.mime,
        fileSize: file.size,
        sha256,
        isDuplicate,
        duplicateOfFileName,
        exifCamera: exifCamera || (exifSoftware ? `Software: ${exifSoftware}` : 'Not present'),
        exifTimestamp: exifTimestamp || 'Not present',
        exifGpsLat,
        exifGpsLng,
        hasExifGps,
        gpsMismatchMeters,
        suspiciousFlag,
        suspiciousReasons,
        advisoryNote:
          'ImageGuard flags metadata and visual anomalies for human inspector review. Automated checks do not conclusively prove or disprove photograph authenticity.',
      });
    } catch (err) {
      console.error('Evidence upload error:', err);
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to process evidence image.' });
    }
  });

  // ── 3. Authenticated Protected Evidence Retrieval ──────────────────────────
  app.get('/api/evidence/file/:filename', verifyAuth, (req: AuthedRequest, res: Response) => {
    const filename = req.params.filename;
    if (!/^[a-f0-9\-]+\.(jpg|jpeg|png|webp)$/.test(filename)) {
      res.status(400).json({ error: 'Invalid evidence filename.' });
      return;
    }
    const targetPath = path.resolve(EVIDENCE_DIR, filename);
    if (!targetPath.startsWith(EVIDENCE_DIR + path.sep)) {
      res.status(403).json({ error: 'Access denied.' });
      return;
    }
    if (!fs.existsSync(targetPath)) {
      res.status(404).json({ error: 'Evidence file not found.' });
      return;
    }
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.sendFile(targetPath);
  });

  // ── 4. Server-Side Gemini Multimodal Inspection + Deterministic EmergencyGuard
  app.post('/api/ai/inspect-complaint', verifyAuth, async (req: AuthedRequest, res: Response) => {
    try {
      const parsedBody = InspectComplaintRequestSchema.safeParse(req.body);
      if (!parsedBody.success) {
        res.status(400).json({ error: 'Invalid inspection request payload.', details: parsedBody.error.flatten() });
        return;
      }

      const { rawText, language, landmark, latitude, longitude, evidenceFiles, taxonomyCatalog, emergencyRules } =
        parsedBody.data;

      // Load image parts securely from confined EVIDENCE_DIR
      const imageParts: Array<{ inlineData: { mimeType: string; data: string } }> = [];
      for (const ef of evidenceFiles) {
        const filePath = path.resolve(EVIDENCE_DIR, ef.storageFileName);
        if (filePath.startsWith(EVIDENCE_DIR + path.sep) && fs.existsSync(filePath)) {
          const data = fs.readFileSync(filePath).toString('base64');
          imageParts.push({
            inlineData: {
              mimeType: ef.mimeType,
              data,
            },
          });
        }
      }

      const taxonomyContext =
        taxonomyCatalog.length > 0
          ? taxonomyCatalog
              .map(
                (t) =>
                  `${t.code} | Domain: ${t.domain} | Category: ${t.category} | Subcategory: ${t.subcategory} | Dept: ${t.department} | DefaultSeverity: ${t.defaultSeverity} | Emergency: ${t.emergencyTrigger}`
              )
              .join('\n')
          : [
              'RDS-POT-001 | Domain: Roads & Mobility | Category: Road Surface | Subcategory: Deep Pothole / Crater | Dept: Roads & Public Works | DefaultSeverity: Medium | Emergency: false',
              'RDS-SNK-002 | Domain: Roads & Mobility | Category: Structural Road Failure | Subcategory: Road Collapse / Sinkhole | Dept: Roads & Public Works | DefaultSeverity: Critical | Emergency: true',
              'TRF-ACC-001 | Domain: Traffic & Safety | Category: Active Accident | Subcategory: Road Accident / Collision Hazard | Dept: Traffic Engineering & Safety | DefaultSeverity: Critical | Emergency: true',
              'ELC-WIR-001 | Domain: Electrical & Lighting | Category: Power Hazard | Subcategory: Live Exposed Cable / Fallen Wire | Dept: Electrical & Street Lighting | DefaultSeverity: Critical | Emergency: true',
              'ELC-STL-002 | Domain: Electrical & Lighting | Category: Street Lighting | Subcategory: Non-Functional Streetlight Cluster | Dept: Electrical & Street Lighting | DefaultSeverity: Medium | Emergency: false',
              'DRN-MNH-001 | Domain: Water & Drainage | Category: Sewerage Safety | Subcategory: Open / Uncovered Manhole | Dept: Water Supply & Drainage | DefaultSeverity: Critical | Emergency: true',
              'DRN-BLK-002 | Domain: Water & Drainage | Category: Stormwater | Subcategory: Blocked Drain / Waterlogging | Dept: Water Supply & Drainage | DefaultSeverity: High | Emergency: false',
              'DRN-PIP-003 | Domain: Water & Drainage | Category: Water Supply | Subcategory: Drinking Water Pipeline Burst / Contamination | Dept: Water Supply & Drainage | DefaultSeverity: High | Emergency: false',
              'SAN-GAR-001 | Domain: Sanitation & Solid Waste | Category: Waste Collection | Subcategory: Overflowing Garbage / Illegal Dumping | Dept: Solid Waste Management | DefaultSeverity: Medium | Emergency: false',
              'STR-COL-001 | Domain: Urban Structures | Category: Structural Hazard | Subcategory: Building / Retaining Wall Collapse Risk | Dept: Building & Structural Safety | DefaultSeverity: Critical | Emergency: true',
              'FIR-GAS-001 | Domain: Public Safety | Category: Fire & Gas | Subcategory: Gas Leak / Active Fire Hazard | Dept: Fire & Disaster Preparedness | DefaultSeverity: Critical | Emergency: true',
            ].join('\n');

      const promptText = `You are CivicAI's municipal grievance inspection analyst for an Indian municipal corporation.
Analyze the citizen complaint text (which may be written in English, Hindi, Tamil, Telugu, Kannada, Marathi, Bengali, Gujarati, or mixed regional script/transliteration) and any attached photograph(s).

Citizen Complaint Details:
- Selected UI Language: ${language}
- Landmark: ${landmark || 'Not provided'}
- GPS Coordinates: ${latitude}, ${longitude}
- Complaint Text: """${rawText}"""
- Attached Photographs Count: ${imageParts.length}

Available Canonical Issue Taxonomy (prefer matching these exact canonicalCode and department values whenever applicable; if a distinct municipal issue is not listed, produce a clean canonicalCode like GEN-OTH-001):
${taxonomyContext}

Mandatory Requirements:
1. Extract EVERY separate municipal issue mentioned in the complaint or visible in the photographs into \`classifiedIssues\` (support multiple distinct issues in one complaint!).
2. Translate the complaint faithfully to English (\`englishTranslation\`) and produce a concise municipal triage summary (\`englishSummary\`).
3. Provide objective \`observations\` and \`imageObservations\` (if images are attached, describe visible civic defects, hazards, lighting, surroundings; if no images attached, state "No photographs attached for visual inspection.").
4. For \`suspiciousVisualFlags\`, note any visual cues that warrant human review (e.g., visible screenshot UI chrome, watermark, stock-photo look, text-image mismatch). NEVER claim that AI conclusively proves an image is authentic or fake.
5. Set \`emergencyFlag: true\` and \`recommendedSeverity: "Critical"\` if there is ANY potential threat to life, active accident, live exposed electric wire, open deep manhole, structural collapse, fire, gas leak, or severe flooding trapping people.
6. Return ONLY valid JSON matching the schema.`;

      const ai = getGeminiClient();
      const contents =
        imageParts.length > 0
          ? { parts: [...imageParts, { text: promptText }] }
          : promptText;

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents,
        config: {
          systemInstruction:
            'You are a careful, factual municipal engineering triage assistant. Never fabricate city infrastructure details not present in the input. Never claim AI conclusively proves image authenticity.',
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              detectedLanguage: { type: Type.STRING },
              englishTranslation: { type: Type.STRING },
              englishSummary: { type: Type.STRING },
              observations: { type: Type.STRING },
              recommendedSeverity: { type: Type.STRING, enum: ['Critical', 'High', 'Medium', 'Low'] },
              emergencyFlag: { type: Type.BOOLEAN },
              emergencyReason: { type: Type.STRING },
              imageObservations: { type: Type.STRING },
              suspiciousVisualFlags: { type: Type.ARRAY, items: { type: Type.STRING } },
              classifiedIssues: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    canonicalCode: { type: Type.STRING },
                    domain: { type: Type.STRING },
                    category: { type: Type.STRING },
                    subcategory: { type: Type.STRING },
                    department: { type: Type.STRING },
                    description: { type: Type.STRING },
                    recommendedSeverity: { type: Type.STRING, enum: ['Critical', 'High', 'Medium', 'Low'] },
                    confidence: { type: Type.NUMBER },
                  },
                  required: [
                    'canonicalCode',
                    'domain',
                    'category',
                    'subcategory',
                    'department',
                    'description',
                    'recommendedSeverity',
                    'confidence',
                  ],
                },
              },
            },
            required: [
              'detectedLanguage',
              'englishTranslation',
              'englishSummary',
              'observations',
              'recommendedSeverity',
              'emergencyFlag',
              'emergencyReason',
              'imageObservations',
              'suspiciousVisualFlags',
              'classifiedIssues',
            ],
          },
        },
      });

      const rawJson = (response.text ?? '').trim();
      if (!rawJson) {
        res.status(502).json({ error: 'Gemini returned an empty response.' });
        return;
      }

      let parsedJson: unknown;
      try {
        parsedJson = JSON.parse(rawJson);
      } catch {
        res.status(502).json({ error: 'Gemini returned malformed JSON that failed strict validation.' });
        return;
      }

      const validated = GeminiInspectionOutputSchema.safeParse(parsedJson);
      if (!validated.success) {
        res.status(502).json({
          error: 'Gemini output did not pass structured schema validation.',
          details: validated.error.flatten(),
        });
        return;
      }

      const aiData = validated.data;
      const classifiedCodes = aiData.classifiedIssues.map((i) => i.canonicalCode);

      // Run Deterministic EmergencyGuard alongside Gemini
      const deterministic = evaluateDeterministicEmergency(
        rawText,
        aiData.englishTranslation,
        emergencyRules,
        classifiedCodes
      );

      const emergencyTriggered = deterministic.triggered || aiData.emergencyFlag;
      let triggerSource: 'deterministic_rule' | 'gemini_ai' | 'hybrid' | 'none' = 'none';
      if (deterministic.triggered && aiData.emergencyFlag) {
        triggerSource = 'hybrid';
      } else if (deterministic.triggered) {
        triggerSource = 'deterministic_rule';
      } else if (aiData.emergencyFlag) {
        triggerSource = 'gemini_ai';
      }

      const finalSeverity: 'Critical' | 'High' | 'Medium' | 'Low' =
        emergencyTriggered && (deterministic.severity === 'Critical' || aiData.emergencyFlag)
          ? 'Critical'
          : emergencyTriggered && aiData.recommendedSeverity !== 'Critical'
          ? 'High'
          : aiData.recommendedSeverity;

      const minAckWindow =
        deterministic.matchedRules.length > 0
          ? Math.min(...deterministic.matchedRules.map((r) => r.ackWindowMinutes))
          : 15;

      const combinedEmergencyReason = [
        deterministic.matchedRules.length > 0
          ? `Deterministic rules matched: ${deterministic.matchedRules.map((r) => `${r.ruleCode} (${r.name})`).join('; ')}.`
          : '',
        aiData.emergencyReason || '',
      ]
        .filter(Boolean)
        .join(' ');

      res.json({
        model: 'gemini-4-hydrogen',
        detectedLanguage: aiData.detectedLanguage,
        englishTranslation: aiData.englishTranslation,
        englishSummary: aiData.englishSummary,
        observations: aiData.observations,
        recommendedSeverity: finalSeverity,
        emergencyFlag: emergencyTriggered,
        emergencyReason: combinedEmergencyReason,
        triggerSource,
        matchedRuleIds: deterministic.matchedRules.map((r) => r.ruleCode),
        ackWindowMinutes: minAckWindow,
        imageObservations: aiData.imageObservations,
        suspiciousVisualFlags: aiData.suspiciousVisualFlags,
        classifiedIssues: aiData.classifiedIssues,
        advisoryDisclaimer:
          'Advisory AI inspection only. Automated visual and text analysis does not conclusively prove image authenticity and does not replace on-site verification by a municipal field inspector.',
        call112Guidance: emergencyTriggered
          ? 'POTENTIAL LIFE-SAFETY EMERGENCY: Please call 112 immediately for police, fire, or ambulance assistance in India. CivicAI notifies the authorized municipal officer and does not directly dispatch 112 emergency services.'
          : '',
      });
    } catch (err) {
      console.error('Gemini inspection error:', err);
      const msg = err instanceof Error ? err.message : 'AI inspection failed.';
      res.status(500).json({ error: msg });
    }
  });

  // ── 5. TwinTrust OpenStreetMap Road Matching + Ward & Hotspot Context ──────
  app.post('/api/twintrust/context', verifyAuth, async (req: AuthedRequest, res: Response) => {
    try {
      const parsed = TwinTrustRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Invalid coordinates or municipal dataset payload.' });
        return;
      }
      const { latitude, longitude, offices, hotspots } = parsed.data;

      // 1. Reverse geocode road & locality from public OpenStreetMap Nominatim (no paid key)
      let roadName = '';
      let osmDisplayName = '';
      let osmSuburb = '';
      let roadMatchSource: 'openstreetmap_nominatim' | 'coordinates_only' = 'coordinates_only';

      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 4500);
        const osmUrl = new URL('https://nominatim.openstreetmap.org/reverse');
        osmUrl.searchParams.set('format', 'jsonv2');
        osmUrl.searchParams.set('lat', String(latitude));
        osmUrl.searchParams.set('lon', String(longitude));
        osmUrl.searchParams.set('zoom', '18');
        osmUrl.searchParams.set('addressdetails', '1');

        const osmResp = await fetch(osmUrl.toString(), {
          signal: controller.signal,
          headers: {
            'User-Agent': 'CivicAI-Municipal-Platform/1.0 (OpenStreetMap TwinTrust Lookup)',
            Accept: 'application/json',
          },
        });
        clearTimeout(timeout);

        if (osmResp.ok) {
          const osmData = (await osmResp.json()) as {
            display_name?: string;
            address?: {
              road?: string;
              pedestrian?: string;
              suburb?: string;
              neighbourhood?: string;
              city_district?: string;
              city?: string;
              town?: string;
            };
          };
          const addr = osmData.address || {};
          roadName = addr.road || addr.pedestrian || addr.neighbourhood || '';
          osmSuburb = addr.suburb || addr.city_district || addr.city || addr.town || '';
          osmDisplayName = osmData.display_name || '';
          if (roadName || osmDisplayName) {
            roadMatchSource = 'openstreetmap_nominatim';
          }
        }
      } catch {
        // Fallback strictly to coordinates + imported data without fabricating road details
      }

      // 2. Match ward jurisdiction using imported municipal_offices bounding boxes
      let matchedOffice = offices.find(
        (o) =>
          latitude >= Math.min(o.minLat, o.maxLat) &&
          latitude <= Math.max(o.minLat, o.maxLat) &&
          longitude >= Math.min(o.minLng, o.maxLng) &&
          longitude <= Math.max(o.minLng, o.maxLng)
      );
      let jurisdictionMatchType: 'ward_boundary_box' | 'nearest_imported_office' | 'unassigned_no_import' =
        'unassigned_no_import';
      let officeDistanceMeters = 0;

      if (matchedOffice) {
        jurisdictionMatchType = 'ward_boundary_box';
        officeDistanceMeters = haversineMeters(latitude, longitude, matchedOffice.latitude, matchedOffice.longitude);
      } else if (offices.length > 0) {
        let best = offices[0];
        let bestDist = haversineMeters(latitude, longitude, best.latitude, best.longitude);
        for (const o of offices.slice(1)) {
          const d = haversineMeters(latitude, longitude, o.latitude, o.longitude);
          if (d < bestDist) {
            bestDist = d;
            best = o;
          }
        }
        matchedOffice = best;
        officeDistanceMeters = bestDist;
        jurisdictionMatchType = 'nearest_imported_office';
      }

      // 3. Match verified historical accident hotspots within 1,000 meters
      const nearbyHotspots = hotspots
        .map((h) => ({
          ...h,
          distanceMeters: haversineMeters(latitude, longitude, h.latitude, h.longitude),
        }))
        .filter((h) => h.distanceMeters <= 1000)
        .sort((a, b) => a.distanceMeters - b.distanceMeters)
        .slice(0, 5);

      res.json({
        latitude,
        longitude,
        roadName: roadName || 'Unmatched road (coordinates recorded)',
        osmSuburb,
        osmDisplayName,
        roadMatchSource,
        jurisdictionMatchType,
        officeDistanceMeters,
        matchedOffice: matchedOffice || null,
        nearbyHotspots,
        infrastructureNote:
          offices.length === 0
            ? 'No municipal office or ward CSV records have been imported yet. Import official ward boundaries in Administrator -> Geographic Data.'
            : 'Ward routing and accident context derived exclusively from OpenStreetMap road matching and administrator-imported municipal records.',
      });
    } catch (err) {
      console.error('TwinTrust context error:', err);
      res.status(500).json({ error: 'Failed to resolve TwinTrust location context.' });
    }
  });

  // ── 6. Server-Side Critical Incident Notification & Escalation SLA ─────────
  app.post('/api/emergency/notify', verifyAuth, (req: AuthedRequest, res: Response) => {
    const parsed = EmergencyNotifySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid emergency notification payload.' });
      return;
    }

    const { complaintId, incidentId, severity, title, wardName, ackWindowMinutes } = parsed.data;
    const createdAtIso = new Date().toISOString();
    const deadlineIso = new Date(Date.now() + ackWindowMinutes * 60 * 1000).toISOString();

    console.info(
      `[EmergencyGuard] Critical Incident Registered | incident=${incidentId} complaint=${complaintId} severity=${severity} ward="${wardName}" ackDeadline=${deadlineIso}`
    );

    res.json({
      registered: true,
      incidentId,
      complaintId,
      severity,
      title,
      registeredAt: createdAtIso,
      acknowledgementDeadline: deadlineIso,
      channels: {
        firestoreRealtimeInApp: true,
        fcmWebPush: Boolean(process.env.VITE_FCM_VAPID_KEY),
        cloudTasksScheduledEscalation: false,
        direct112Dispatch: false,
      },
      guidance:
        'Call 112 immediately for life-threatening emergencies in India. CivicAI routes Critical incidents to the authorized on-duty municipal officer with backup escalation tracking and does not directly dispatch 112 emergency services.',
    });
  });

  // ── Frontend Vite Dev Middleware / Production Static Serving ───────────────
  if (!IS_PROD) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.resolve(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`CivicAI server running on http://0.0.0.0:${PORT} (${IS_PROD ? 'production' : 'development'})`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start CivicAI server:', err);
  process.exit(1);
});
