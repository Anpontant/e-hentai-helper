import { preloadThumbs } from '../state.js';

export function PreloadThumbs() {
  var thumbs = preloadThumbs.value;
  if (!thumbs.length) return null;

  return (
    <div id="eh-helper-preload-thumbs">
      {thumbs.map(function (img, i) {
        return <img key={i} src={img.src} />;
      })}
    </div>
  );
}
