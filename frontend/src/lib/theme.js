import { writable } from 'svelte/store';
import { browser } from '$app/environment';

const saved = browser ? (localStorage.getItem('fiestra-theme') ?? 'system') : 'system'; // if browser has something to return then return either dark or light and if Null then system, also when default system

export const theme = writable(saved);

theme.subscribe((value) => {
  if (!browser) return;

  localStorage.setItem('fiestra-theme', value);

  if (value === 'light') {
    document.documentElement.setAttribute('data-theme', 'light');
  } else if (value === 'dark') {
    document.documentElement.setAttribute('data-theme', 'dark');
  } else {
    document.documentElement.removeAttribute('data-theme');
  }
});