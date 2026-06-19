'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';

type Theme = 'dark' | 'light';

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>('dark');

  useEffect(() => {
    const stored = window.localStorage.getItem('pp-theme');
    setTheme(stored === 'light' ? 'light' : 'dark');
  }, []);

  function toggle() {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    document.documentElement.classList.toggle('light', next === 'light');
    window.localStorage.setItem('pp-theme', next);
  }

  return (
    <Button variant="ghost" size="sm" aria-label="Toggle theme" onClick={toggle}>
      {theme === 'dark' ? 'Light' : 'Dark'}
    </Button>
  );
}
