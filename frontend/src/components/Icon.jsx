import React from 'react';

// Small stroke icon set (24x24 grid). Decorative by default: pair with a visible label or aria-label on the button.
const PATHS = {
    overview: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
    documents: 'M7 3h7l5 5v13H7zM14 3v5h5M10 13h6M10 17h6',
    frameworks: 'M12 3l8 3v6c0 4.5-3.2 7.6-8 9-4.8-1.4-8-4.5-8-9V6zM8.5 12l2.5 2.5 4.5-5',
    reminders: 'M3 6h18v12H3zM3 7l9 7 9-7',
    analytics: 'M5 20V11M12 20V4M19 20v-6',
    audit: 'M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01',
    download: 'M12 4v11M7.5 10.5L12 15l4.5-4.5M5 20h14',
    edit: 'M4 20l1-4L16.5 4.5a2 2 0 012.8 0l.2.2a2 2 0 010 2.8L8 19zM14.5 6.5l3 3',
    trash: 'M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13M10 11v6M14 11v6',
    restore: 'M4 12a8 8 0 108-8 8 8 0 00-5.7 2.4L4 9M4 4v5h5',
    search: 'M11 4a7 7 0 100 14 7 7 0 000-14zM20 20l-4-4',
    close: 'M6 6l12 12M18 6L6 18',
    plus: 'M12 5v14M5 12h14',
    sun: 'M12 8a4 4 0 100 8 4 4 0 000-8zM12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6L7 7M17 17l1.4 1.4M18.4 5.6L17 7M7 17l-1.4 1.4',
    moon: 'M20 14.5A8 8 0 019.5 4a8 8 0 1010.5 10.5z',
    signout: 'M10 4H5v16h5M14 8l4 4-4 4M18 12H9',
};

function Icon({ name, size = 18 }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
            <path d={PATHS[name]} />
        </svg>
    );
}

export default Icon;
