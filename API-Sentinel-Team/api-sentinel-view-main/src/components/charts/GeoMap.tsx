import React, { useState } from 'react';
import { ComposableMap, Geographies, Geography, Marker, ZoomableGroup } from 'react-simple-maps';

const GEO_URL = 'https://unpkg.com/world-atlas@2.0.2/countries-110m.json';

interface ThreatMarker {
  lat: number;
  lng: number;
  severity: 'critical' | 'high' | 'medium' | 'low';
  label?: string;
  count?: number;
}

interface GeoMapProps {
  threats?: ThreatMarker[];
  height?: number;
  showControls?: boolean;
}

const severityColors = {
  critical: '#EF4444',
  high: '#F97316',
  medium: '#EAB308',
  low: '#22C55E',
};

const GeoMap: React.FC<GeoMapProps> = ({ threats = [], height = 200, showControls = true }) => {
  const [zoom, setZoom] = useState(1);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; text: string } | null>(null);

  return (
    <div
      className="w-full bg-bg-base rounded-lg border border-border-subtle overflow-hidden relative"
      style={{ height }}
    >
      <span className="absolute top-2 left-3 text-[10px] text-text-muted font-medium z-10">
        Global Threat Map
      </span>

      {/* Zoom controls */}
      {showControls && (
        <div className="absolute top-2 right-2 flex flex-col gap-1 z-10">
          <button
            onClick={() => setZoom((z) => Math.min(z * 1.5, 8))}
            className="w-6 h-6 rounded bg-bg-elevated border border-border-subtle text-text-secondary hover:text-text-primary text-xs flex items-center justify-center transition-colors"
          >
            +
          </button>
          <button
            onClick={() => setZoom((z) => Math.max(z / 1.5, 1))}
            className="w-6 h-6 rounded bg-bg-elevated border border-border-subtle text-text-secondary hover:text-text-primary text-xs flex items-center justify-center transition-colors"
          >
            −
          </button>
        </div>
      )}

      <ComposableMap
        projection="geoMercator"
        style={{ width: '100%', height: '100%' }}
        projectionConfig={{ scale: 120 }}
      >
        <ZoomableGroup zoom={zoom} center={[0, 20]}>
          <Geographies geography={GEO_URL}>
            {({ geographies }) =>
              geographies.map((geo) => (
                <Geography
                  key={geo.rsmKey}
                  geography={geo}
                  fill="#1E293B"
                  stroke="#0F172A"
                  strokeWidth={0.5}
                  style={{
                    default: { outline: 'none' },
                    hover: { outline: 'none', fill: '#334155', transition: 'fill 0.2s' },
                    pressed: { outline: 'none' },
                  }}
                  onMouseEnter={(evt) => {
                    const name = geo.properties?.name || '';
                    if (name) {
                      setTooltip({
                        x: evt.clientX,
                        y: evt.clientY,
                        text: name,
                      });
                    }
                  }}
                  onMouseLeave={() => setTooltip(null)}
                />
              ))
            }
          </Geographies>
          {threats.map((t, i) => (
            <Marker key={i} coordinates={[t.lng, t.lat]}>
              {/* Outer pulse */}
              <circle r={10} fill={severityColors[t.severity]} opacity={0.1}>
                <animate
                  attributeName="r"
                  values="8;16;8"
                  dur="2s"
                  repeatCount="indefinite"
                />
                <animate
                  attributeName="opacity"
                  values="0.15;0;0.15"
                  dur="2s"
                  repeatCount="indefinite"
                />
              </circle>
              {/* Middle ring */}
              <circle r={6} fill={severityColors[t.severity]} opacity={0.25}>
                <animate
                  attributeName="r"
                  values="5;9;5"
                  dur="2s"
                  repeatCount="indefinite"
                  begin="0.3s"
                />
              </circle>
              {/* Core dot */}
              <circle
                r={3.5}
                fill={severityColors[t.severity]}
                opacity={0.9}
                style={{ filter: `drop-shadow(0 0 4px ${severityColors[t.severity]}80)` }}
              />
              {t.count && t.count > 1 && (
                <text
                  textAnchor="middle"
                  y={-10}
                  style={{
                    fontSize: '8px',
                    fill: severityColors[t.severity],
                    fontWeight: 700,
                    fontFamily: 'Plus Jakarta Sans',
                  }}
                >
                  {t.count}
                </text>
              )}
            </Marker>
          ))}
        </ZoomableGroup>
      </ComposableMap>

      {/* Country tooltip */}
      {tooltip && (
        <div
          className="fixed z-50 glass-card-premium px-2.5 py-1 rounded text-[10px] text-text-primary pointer-events-none"
          style={{
            left: tooltip.x + 12,
            top: tooltip.y - 8,
          }}
        >
          {tooltip.text}
        </div>
      )}
    </div>
  );
};

export default GeoMap;
