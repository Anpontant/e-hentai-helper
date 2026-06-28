import { settings } from '../state.js';
import { Menu } from './Menu.jsx';
import { StatusDisplay } from './StatusDisplay.jsx';
import { SpreadOverlay } from './SpreadOverlay.jsx';
import { PreloadThumbs } from './PreloadThumbs.jsx';

export function App() {
  const s = settings.value;

  return (
    <>
      <Menu />
      {s.showStatus && <StatusDisplay />}
      <SpreadOverlay />
      {s.showPreloadThumbs && <PreloadThumbs />}
    </>
  );
}
