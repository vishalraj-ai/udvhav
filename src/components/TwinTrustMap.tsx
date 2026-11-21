import { useEffect, useRef } from 'react';
import L from 'leaflet';
import type { AccidentHotspotRecord, ComplaintRecord, MunicipalOfficeRecord } from '../types/civic';

interface TwinTrustMapProps {
  centerLat: number;
  centerLng: number;
  selectedLat?: number;
  selectedLng?: number;
  interactivePick?: boolean;
  onPickLocation?: (lat: number, lng: number) => void;
  offices: MunicipalOfficeRecord[];
  hotspots: AccidentHotspotRecord[];
  complaints?: ComplaintRecord[];
  heightClass?: string;
}

function escapeHtml(value: string): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function createPinIcon(color: string, label: string): L.DivIcon {
  const safeColor = /^#[0-9a-fA-F]{6}$/.test(color) ? color : '#0f172a';
  const safeLabel = escapeHtml(label.slice(0, 2));
  return L.divIcon({
    className: 'civicai-map-pin',
    html: `<div style="display:flex;align-items:center;justify-content:center;width:26px;height:26px;border-radius:9999px;background:${safeColor};color:#fff;font-weight:700;font-size:11px;border:2px solid #fff;box-shadow:0 2px 6px rgba(15,23,42,0.35);">${safeLabel}</div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
  });
}

export function TwinTrustMap({
  centerLat,
  centerLng,
  selectedLat,
  selectedLng,
  interactivePick = false,
  onPickLocation,
  offices,
  hotspots,
  complaints = [],
  heightClass = 'h-72',
}: TwinTrustMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerGroupRef = useRef<L.LayerGroup | null>(null);
  const onPickRef = useRef(onPickLocation);
  onPickRef.current = onPickLocation;

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: [centerLat, centerLng],
      zoom: 13,
      scrollWheelZoom: true,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map);

    const group = L.layerGroup().addTo(map);
    mapRef.current = map;
    layerGroupRef.current = group;

    if (interactivePick) {
      map.on('click', (e: L.LeafletMouseEvent) => {
        onPickRef.current?.(Number(e.latlng.lat.toFixed(6)), Number(e.latlng.lng.toFixed(6)));
      });
    }

    return () => {
      map.remove();
      mapRef.current = null;
      layerGroupRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const group = layerGroupRef.current;
    if (!map || !group) return;

    group.clearLayers();

    // Render imported municipal ward bounding boxes & office locations
    offices.forEach((office) => {
      const bounds: L.LatLngBoundsExpression = [
        [Math.min(office.minLat, office.maxLat), Math.min(office.minLng, office.maxLng)],
        [Math.max(office.minLat, office.maxLat), Math.max(office.minLng, office.maxLng)],
      ];
      L.rectangle(bounds, {
        color: '#1d4ed8',
        weight: 1.5,
        fillOpacity: 0.05,
        dashArray: '4 4',
      })
        .bindPopup(
          `<strong>${escapeHtml(office.wardName)}</strong><br/>Office: ${escapeHtml(office.officeName)}<br/>Dept: ${escapeHtml(office.department)}`
        )
        .addTo(group);

      L.marker([office.latitude, office.longitude], {
        icon: createPinIcon('#1d4ed8', 'M'),
      })
        .bindPopup(
          `<strong>${escapeHtml(office.officeName)}</strong><br/>Code: ${escapeHtml(office.officeCode)}<br/>Ward: ${escapeHtml(office.wardName)}<br/>Officer: ${escapeHtml(office.primaryOfficerName || 'Unassigned')}`
        )
        .addTo(group);
    });

    // Render verified historical accident hotspots
    hotspots.forEach((h) => {
      L.circleMarker([h.latitude, h.longitude], {
        radius: 8,
        color: '#dc2626',
        fillColor: '#ef4444',
        fillOpacity: 0.45,
        weight: 2,
      })
        .bindPopup(
          `<strong>Verified Accident Hotspot</strong><br/>${escapeHtml(h.locationName)} (${escapeHtml(h.roadName)})<br/>Incidents: ${Number(h.incidentCount)} · Fatalities: ${Number(h.fatalities)}<br/>Source: ${escapeHtml(h.sourceDataset)}`
        )
        .addTo(group);
    });

    // Render active complaints
    complaints.forEach((c) => {
      const color =
        c.severity === 'Critical'
          ? '#dc2626'
          : c.severity === 'High'
          ? '#d97706'
          : c.severity === 'Medium'
          ? '#2563eb'
          : '#475569';
      L.marker([c.latitude, c.longitude], {
        icon: createPinIcon(color, c.isEmergency ? '!' : 'C'),
      })
        .bindPopup(
          `<strong>${escapeHtml(c.complaintCode)}</strong> (${escapeHtml(c.severity)})<br/>${escapeHtml(c.primaryDepartment)}<br/>Status: ${escapeHtml(c.status)}<br/>${escapeHtml(c.roadName)}`
        )
        .addTo(group);
    });

    // Render currently selected GPS pin
    if (typeof selectedLat === 'number' && typeof selectedLng === 'number') {
      L.marker([selectedLat, selectedLng], {
        icon: createPinIcon('#0f172a', '+'),
      })
        .bindPopup(`Selected GPS: ${selectedLat.toFixed(5)}, ${selectedLng.toFixed(5)}`)
        .addTo(group);
      map.setView([selectedLat, selectedLng], Math.max(map.getZoom(), 13), { animate: false });
    } else {
      map.setView([centerLat, centerLng], map.getZoom(), { animate: false });
    }
  }, [centerLat, centerLng, selectedLat, selectedLng, offices, hotspots, complaints]);

  return (
    <div className="space-y-2">
      <div
        ref={containerRef}
        className={`w-full ${heightClass} rounded-md border border-slate-200 overflow-hidden bg-slate-100`}
      />
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
        <div className="flex flex-wrap items-center gap-3">
          <span>Map: OpenStreetMap (no paid API required)</span>
          <span aria-hidden="true">·</span>
          <span>Blue M: Imported Municipal Offices ({offices.length})</span>
          <span aria-hidden="true">·</span>
          <span>Red Circles: Verified Accident Hotspots ({hotspots.length})</span>
        </div>
        {interactivePick && <span>Click anywhere on the map to set GPS coordinates</span>}
      </div>
    </div>
  );
}
