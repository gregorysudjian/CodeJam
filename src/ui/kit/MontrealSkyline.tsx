import * as React from "react";
import { cn } from "@/ui/lib/utils";

/** Flat Montreal skyline silhouette (Mount Royal and its cross, downtown towers, the Olympic
 *  Stadium's leaning tower, the Jacques-Cartier bridge). Fills with currentColor, 1600×260. */
export function MontrealSkyline({ className, ...props }: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 1600 260"
      preserveAspectRatio="xMidYMax slice"
      aria-hidden="true"
      className={cn("block", className)}
      fill="currentColor"
      {...props}
    >
      {/* Mount Royal and the cross */}
      <path d="M0 260 V190 C120 150 230 92 360 86 C470 82 560 130 660 170 L700 190 V260 Z" opacity="0.55" />
      <rect x="352" y="40" width="5" height="48" opacity="0.55" />
      <rect x="340" y="54" width="29" height="5" opacity="0.55" />
      {/* Downtown */}
      <rect x="560" y="120" width="44" height="140" />
      <rect x="612" y="78" width="52" height="182" />
      <path d="M672 260 V62 L700 44 L728 62 V260 Z" />
      <rect x="736" y="104" width="40" height="156" />
      {/* Place Ville Marie: a cross-shaped tower */}
      <rect x="784" y="70" width="66" height="190" />
      <rect x="774" y="96" width="86" height="164" />
      <rect x="858" y="128" width="38" height="132" />
      <path d="M904 260 V88 L930 70 L956 88 V260 Z" />
      <rect x="964" y="140" width="48" height="120" />
      {/* Olympic Stadium: the leaning tower over the bowl */}
      <path d="M1060 260 C1080 200 1200 196 1230 260 Z" opacity="0.8" />
      <path d="M1104 214 L1150 70 L1170 74 L1138 220 Z" opacity="0.8" />
      {/* Jacques-Cartier bridge */}
      <g opacity="0.6">
        <rect x="1240" y="214" width="360" height="8" />
        <path d="M1300 214 L1340 160 L1380 214 Z M1380 214 L1420 150 L1460 214 Z M1460 214 L1500 160 L1540 214 Z" fill="none" stroke="currentColor" strokeWidth="6" />
        <rect x="1336" y="214" width="8" height="46" />
        <rect x="1416" y="214" width="8" height="46" />
        <rect x="1496" y="214" width="8" height="46" />
      </g>
      <rect x="0" y="252" width="1600" height="8" />
    </svg>
  );
}
