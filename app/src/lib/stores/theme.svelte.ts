import { browser } from '$app/environment';

export type Theme = 'dark' | 'light';

const STORAGE_KEY = 'aawcs.theme';

function readStored(): Theme {
	if (!browser) return 'dark';
	const stored = localStorage.getItem(STORAGE_KEY);
	return stored === 'light' ? 'light' : 'dark';
}

class ThemeStore {
	current = $state<Theme>(readStored());

	set(theme: Theme) {
		this.current = theme;
		if (browser) {
			localStorage.setItem(STORAGE_KEY, theme);
			document.documentElement.classList.toggle('light', theme === 'light');
			document.documentElement.classList.toggle('dark', theme === 'dark');
		}
	}

	toggle() {
		this.set(this.current === 'dark' ? 'light' : 'dark');
	}
}

export const theme = new ThemeStore();
