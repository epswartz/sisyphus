// Marble illustrations as inline SVG strings.

export const bust = (size = 70) => `
<svg class="art" role="img" aria-label="Marble bust" width="${size}" height="${Math.round(size * 1.375)}" viewBox="0 0 80 110">
<g stroke="#8C877E" stroke-width="0.9" stroke-linejoin="round" stroke-linecap="round">
<rect x="18" y="98" width="44" height="9" rx="1" fill="#DCD6CA"/>
<rect x="25" y="91" width="30" height="7" fill="#E6E1D7"/>
<path d="M33 52 L33 66 Q40 70 47 66 L47 52 Z" fill="#DCD6CA"/>
<path d="M10 91 C 12 74, 24 67, 34 64 Q40 68 46 64 C 56 67, 68 74, 70 91 Z" fill="#ECE8E1"/>
<path d="M20 76 C 30 80, 38 84, 44 91 M28 69 C 36 75, 46 80, 58 88 M50 67 C 54 72, 60 78, 64 84" fill="none" stroke="#B8B1A4"/>
<path d="M28 30 C 28 16, 52 16, 52 30 L52 40 C 52 50, 46 56, 40 56 C 34 56, 28 50, 28 40 Z" fill="#F4F1EC"/>
<path d="M47 30 C 52 35, 52 45, 46 53 C 49 46, 50 38, 47 30 Z" fill="#DCD6CA" stroke="none"/>
<g fill="#E2DCD1">
<circle cx="27" cy="34" r="3.6"/><circle cx="27" cy="27.5" r="3.8"/><circle cx="30.5" cy="21.5" r="3.8"/><circle cx="35.5" cy="17.5" r="3.8"/><circle cx="40.5" cy="16.3" r="3.8"/><circle cx="45.5" cy="17.8" r="3.8"/><circle cx="50" cy="22" r="3.8"/><circle cx="53" cy="28" r="3.8"/><circle cx="53" cy="34.5" r="3.6"/>
</g>
<path d="M33 34 Q35.5 32.4 38 34 M42 34 Q44.5 32.4 47 34 M34.2 37.5 h3 M42.8 37.5 h3 M40 35 L38.8 43 Q40 44.2 41.6 43 M37.5 48.2 Q40 49.6 42.5 48.2" fill="none"/>
</g>
</svg>`;

export const column = (size = 54) => `
<svg class="art" role="img" aria-label="Marble column" width="${size}" height="${size * 2}" viewBox="0 0 60 120">
<g stroke="#8C877E" stroke-width="0.9" stroke-linejoin="round">
<rect x="16" y="20" width="28" height="82" fill="#ECE8E1"/>
<rect x="37" y="20" width="7" height="82" fill="#DCD6CA" stroke="none"/>
<path d="M21 21 V101 M25.5 21 V101 M30 21 V101 M34.5 21 V101 M39 21 V101" stroke="#C9C2B5" stroke-width="0.7"/>
<path d="M8 11 H52 Q50 19 43 19 H17 Q10 19 8 11 Z" fill="#E6E1D7"/>
<rect x="4" y="5" width="52" height="6" rx="1" fill="#F4F1EC"/>
<circle cx="10" cy="16" r="5.5" fill="#F4F1EC"/><circle cx="10" cy="16" r="2.2" fill="none"/>
<circle cx="50" cy="16" r="5.5" fill="#F4F1EC"/><circle cx="50" cy="16" r="2.2" fill="none"/>
<rect x="12" y="102" width="36" height="5" rx="2" fill="#E6E1D7"/>
<rect x="8" y="107" width="44" height="8" rx="1" fill="#DCD6CA"/>
</g>
</svg>`;

const icon = (d, extra = '') =>
  `<svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"${extra}>${d}</svg>`;

export const icons = {
  workout: icon('<path d="M6.5 7v10M17.5 7v10M3.5 9.5v5M20.5 9.5v5M6.5 12h11"/>'),
  log: icon('<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>'),
  schedule: icon('<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 5V3M15 5V3"/>'),
  check: '<svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5 9-10"/></svg>',
  chevron: '<svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>',
  back: '<svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15 6l-6 6 6 6"/></svg>',
};
