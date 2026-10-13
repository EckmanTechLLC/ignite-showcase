/** Overlay state. Task-68 adds trends / alarms / controls / identity panels next to help. */
export const ui = $state({ help: new URLSearchParams(location.search).has('about') });
