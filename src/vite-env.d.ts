/// <reference types="vite/client" />

// Audio asset imports → bundled URL string (Vite). mp3 isn't in vite/client's
// default asset list, so declare it for the menu theme music.
declare module '*.mp3' {
  const src: string;
  export default src;
}
