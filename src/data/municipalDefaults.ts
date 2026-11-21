import type { SeverityLevel } from '../types/civic';

export interface StarterTaxonomyItem {
  code: string;
  domain: string;
  category: string;
  subcategory: string;
  department: string;
  defaultSeverity: SeverityLevel;
  emergencyTrigger: boolean;
  slaHours: number;
}

export const STARTER_TAXONOMY: StarterTaxonomyItem[] = [
  {
    code: 'RDS-POT-001',
    domain: 'Roads & Mobility',
    category: 'Road Surface',
    subcategory: 'Deep Pothole / Damaged Carriageway',
    department: 'Roads & Public Works',
    defaultSeverity: 'Medium',
    emergencyTrigger: false,
    slaHours: 72,
  },
  {
    code: 'RDS-SNK-002',
    domain: 'Roads & Mobility',
    category: 'Structural Road Failure',
    subcategory: 'Road Cave-In / Sinkhole',
    department: 'Roads & Public Works',
    defaultSeverity: 'Critical',
    emergencyTrigger: true,
    slaHours: 4,
  },
  {
    code: 'TRF-ACC-001',
    domain: 'Traffic & Safety',
    category: 'Active Accident',
    subcategory: 'Road Collision / Active Accident Hazard',
    department: 'Traffic Engineering & Safety',
    defaultSeverity: 'Critical',
    emergencyTrigger: true,
    slaHours: 1,
  },
  {
    code: 'ELC-WIR-001',
    domain: 'Electrical & Lighting',
    category: 'Power Hazard',
    subcategory: 'Live Exposed Cable / Fallen Electric Wire',
    department: 'Electrical & Street Lighting',
    defaultSeverity: 'Critical',
    emergencyTrigger: true,
    slaHours: 1,
  },
  {
    code: 'ELC-STL-002',
    domain: 'Electrical & Lighting',
    category: 'Street Lighting',
    subcategory: 'Non-Functional Streetlight Cluster',
    department: 'Electrical & Street Lighting',
    defaultSeverity: 'Medium',
    emergencyTrigger: false,
    slaHours: 48,
  },
  {
    code: 'DRN-MNH-001',
    domain: 'Water & Drainage',
    category: 'Sewerage Safety',
    subcategory: 'Open / Uncovered Deep Manhole',
    department: 'Water Supply & Drainage',
    defaultSeverity: 'Critical',
    emergencyTrigger: true,
    slaHours: 2,
  },
  {
    code: 'DRN-BLK-002',
    domain: 'Water & Drainage',
    category: 'Stormwater Drainage',
    subcategory: 'Blocked Drain / Severe Waterlogging',
    department: 'Water Supply & Drainage',
    defaultSeverity: 'High',
    emergencyTrigger: false,
    slaHours: 24,
  },
  {
    code: 'DRN-PIP-003',
    domain: 'Water & Drainage',
    category: 'Water Supply',
    subcategory: 'Drinking Water Main Burst / Contamination',
    department: 'Water Supply & Drainage',
    defaultSeverity: 'High',
    emergencyTrigger: false,
    slaHours: 12,
  },
  {
    code: 'SAN-GAR-001',
    domain: 'Sanitation & Solid Waste',
    category: 'Waste Collection',
    subcategory: 'Overflowing Municipal Bin / Uncollected Waste',
    department: 'Solid Waste Management',
    defaultSeverity: 'Medium',
    emergencyTrigger: false,
    slaHours: 24,
  },
  {
    code: 'STR-COL-001',
    domain: 'Urban Structures',
    category: 'Structural Hazard',
    subcategory: 'Building / Retaining Wall Collapse Risk',
    department: 'Building & Structural Safety',
    defaultSeverity: 'Critical',
    emergencyTrigger: true,
    slaHours: 2,
  },
  {
    code: 'FIR-GAS-001',
    domain: 'Public Safety',
    category: 'Fire & Gas Hazard',
    subcategory: 'Gas Pipeline Leak / Active Fire',
    department: 'Fire & Disaster Preparedness',
    defaultSeverity: 'Critical',
    emergencyTrigger: true,
    slaHours: 1,
  },
];

export interface StarterEmergencyRule {
  ruleCode: string;
  name: string;
  keywords: string[];
  taxonomyCodes: string[];
  severity: 'Critical' | 'High';
  ackWindowMinutes: number;
}

export const STARTER_EMERGENCY_RULES: StarterEmergencyRule[] = [
  {
    ruleCode: 'EMG-LIFE-ELEC',
    name: 'Live Exposed Wire / Electrocution Hazard',
    keywords: ['live wire', 'electrocution', 'sparking wire', 'high voltage', 'बिजली का तार', 'करंट', 'மின் கம்பி'],
    taxonomyCodes: ['ELC-WIR-001'],
    severity: 'Critical',
    ackWindowMinutes: 10,
  },
  {
    ruleCode: 'EMG-LIFE-ACC',
    name: 'Active Road Accident / Injury Report',
    keywords: ['accident', 'collision', 'crash', 'injured', 'bleeding', 'दुर्घटना', 'घायल', 'விபத்து', 'ప్రమాదం'],
    taxonomyCodes: ['TRF-ACC-001'],
    severity: 'Critical',
    ackWindowMinutes: 10,
  },
  {
    ruleCode: 'EMG-LIFE-MANHOLE',
    name: 'Open Deep Manhole / Sinkhole Collapse',
    keywords: ['open manhole', 'uncovered manhole', 'sinkhole', 'collapse', 'मैनहोल खुला', 'गिर गया'],
    taxonomyCodes: ['DRN-MNH-001', 'RDS-SNK-002', 'STR-COL-001'],
    severity: 'Critical',
    ackWindowMinutes: 15,
  },
  {
    ruleCode: 'EMG-LIFE-FIRE',
    name: 'Gas Leak / Active Fire / Toxic Smoke',
    keywords: ['gas leak', 'fire', 'explosion', 'burning', 'आग', 'गैस लीक', 'தீ'],
    taxonomyCodes: ['FIR-GAS-001'],
    severity: 'Critical',
    ackWindowMinutes: 10,
  },
];

export const MUNICIPAL_DEPARTMENTS = [
  'Roads & Public Works',
  'Water Supply & Drainage',
  'Electrical & Street Lighting',
  'Solid Waste Management',
  'Traffic Engineering & Safety',
  'Building & Structural Safety',
  'Fire & Disaster Preparedness',
  'Public Health & Parks',
];

export const OFFICES_CSV_TEMPLATE = [
  'officeCode,officeName,department,wardId,wardName,address,latitude,longitude,minLat,maxLat,minLng,maxLng,contactPhone',
  'OFF-W01-PWD,Zone 1 Public Works Zonal Office,Roads & Public Works,WARD-01,Ward 01 Central Civic,Civic Plaza Main Road,28.6139,77.2090,28.5900,28.6400,77.1800,77.2400,+91-11-23001001',
  'OFF-W02-WSD,Zone 2 Water & Drainage Office,Water Supply & Drainage,WARD-02,Ward 02 North Extension,Station Road Block B,28.6550,77.2210,28.6401,28.6900,77.1900,77.2600,+91-11-23001002',
].join('\n');

export const HOTSPOTS_CSV_TEMPLATE = [
  'recordCode,locationName,roadName,wardId,latitude,longitude,incidentCount,fatalities,injuries,sourceDataset,verifiedDate',
  'ACC-2025-001,Ring Road Arterial Junction,Inner Ring Road,WARD-01,28.6185,77.2145,14,2,19,Municipal Traffic Police Annual Audit 2025,2025-12-31',
  'ACC-2025-002,North Bus Depot Crossing,Station Road,WARD-02,28.6512,77.2194,9,1,11,Municipal Traffic Police Annual Audit 2025,2025-12-31',
].join('\n');
