import React from 'react';
import Icon from './Icon';
import { useTheme } from '../context/ThemeContext';

/** Shows the theme you will switch to, not the one you are in. */
function ThemeToggle() {
    const { theme, toggle, following } = useTheme();
    const next = theme === 'dark' ? 'light' : 'dark';

    return (
        <button type="button" className="theme-toggle" onClick={toggle} aria-label={`Switch to ${next} theme`} title={`Switch to ${next} theme${following ? ' (now following your system setting)' : ''}`}>
            <Icon name={next === 'light' ? 'sun' : 'moon'} size={16} />
            <span>{next === 'light' ? 'Light theme' : 'Dark theme'}</span>
        </button>
    );
}

export default ThemeToggle;
