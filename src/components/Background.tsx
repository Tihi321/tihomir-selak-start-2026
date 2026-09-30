import { Show } from 'solid-js';
import { photoById } from '@/data/backgrounds';
import type { Background as BackgroundConfig } from '@/lib/config/schema';

/**
 * Photo and custom backgrounds are a plain <img>, never a CSS url(), so a
 * user-supplied address cannot inject CSS. Field and plain draw nothing here.
 */
export default function Background(props: {
  background: BackgroundConfig;
  onCustomError: () => void;
}) {
  const src = () => {
    const { kind, photo, customUrl } = props.background;
    if (kind === 'photo') return photoById(photo).src;
    if (kind === 'custom' && customUrl) return customUrl;
    return '';
  };
  return (
    <Show when={src()} keyed>
      {(url) => (
        <div class="bg-layer" aria-hidden="true">
          <img
            class="bg-image"
            src={url}
            alt=""
            decoding="async"
            referrerpolicy="no-referrer"
            onError={() => {
              if (props.background.kind === 'custom') props.onCustomError();
            }}
          />
          <div class="bg-vignette" />
        </div>
      )}
    </Show>
  );
}
