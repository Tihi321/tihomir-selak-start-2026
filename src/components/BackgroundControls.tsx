import { For, Show, createSignal } from 'solid-js';
import { backgroundPhotos, randomPhotoId } from '@/data/backgrounds';
import {
  normalizeImageUrl,
  type Background,
  type BackgroundKind,
} from '@/lib/config/schema';

const kindLabels: Record<BackgroundKind, string> = {
  field: 'Neural field',
  photo: 'Photo',
  custom: 'Your image',
  plain: 'Plain',
};
const kinds = Object.keys(kindLabels) as BackgroundKind[];

/**
 * Shared background picker. The popover uses radios, the settings dialog a
 * select. Every change goes through onChange, which persists the config.
 */
export default function BackgroundControls(props: {
  idPrefix: string;
  variant: 'radio' | 'select';
  background: Background;
  onChange: (next: Background) => boolean;
  onPicked?: () => void;
}) {
  const [pendingCustom, setPendingCustom] = createSignal(false);
  const [urlValue, setUrlValue] = createSignal('');
  const [urlEdited, setUrlEdited] = createSignal(false);
  const [error, setError] = createSignal('');
  const id = (name: string) => `${props.idPrefix}-${name}`;

  // The URL field shows the saved address until the user starts typing.
  const shownUrl = () =>
    urlEdited() ? urlValue() : (props.background.customUrl ?? '');
  const shownKind = (): BackgroundKind =>
    pendingCustom() ? 'custom' : props.background.kind;

  function pick(kind: BackgroundKind) {
    setError('');
    if (kind === 'custom' && !props.background.customUrl) {
      setPendingCustom(true);
      return;
    }
    setPendingCustom(false);
    if (
      props.onChange({ ...props.background, kind }) &&
      (kind === 'field' || kind === 'plain')
    )
      props.onPicked?.();
  }

  function shuffle() {
    props.onChange({
      ...props.background,
      kind: 'photo',
      photo: randomPhotoId(props.background.photo),
    });
  }

  function saveUrl(event: SubmitEvent) {
    event.preventDefault();
    try {
      const customUrl = normalizeImageUrl(shownUrl());
      setError('');
      if (props.onChange({ ...props.background, kind: 'custom', customUrl })) {
        setPendingCustom(false);
        setUrlEdited(false);
      }
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : 'Enter a valid image link.',
      );
    }
  }

  return (
    <div class="bg-controls">
      <Show
        when={props.variant === 'radio'}
        fallback={
          <>
            <label for={id('kind')}>Background</label>
            <select
              id={id('kind')}
              value={shownKind()}
              onChange={(event) =>
                pick(event.currentTarget.value as BackgroundKind)
              }
            >
              <For each={kinds}>
                {(kind) => <option value={kind}>{kindLabels[kind]}</option>}
              </For>
            </select>
          </>
        }
      >
        <div role="radiogroup" aria-label="Background" class="bg-radios">
          <For each={kinds}>
            {(kind) => (
              <label class="bg-radio">
                <input
                  type="radio"
                  name={id('kind')}
                  value={kind}
                  checked={shownKind() === kind}
                  onChange={() => pick(kind)}
                />
                <span>{kindLabels[kind]}</span>
              </label>
            )}
          </For>
        </div>
      </Show>

      <Show when={shownKind() === 'photo'}>
        <div class="bg-row">
          <label class="sr-only" for={id('photo')}>
            Photo
          </label>
          <select
            id={id('photo')}
            value={props.background.photo}
            onChange={(event) =>
              props.onChange({
                ...props.background,
                kind: 'photo',
                photo: event.currentTarget.value,
              })
            }
          >
            <For each={backgroundPhotos}>
              {(photo) => <option value={photo.id}>{photo.label}</option>}
            </For>
          </select>
          <button type="button" class="secondary-button" onClick={shuffle}>
            Shuffle photo
          </button>
        </div>
      </Show>

      <Show when={shownKind() === 'custom'}>
        <form class="bg-row bg-url" onSubmit={saveUrl} novalidate>
          <label class="sr-only" for={id('url')}>
            Image address
          </label>
          <input
            id={id('url')}
            type="text"
            inputmode="url"
            autocomplete="off"
            placeholder="https://example.com/photo.jpg"
            value={shownUrl()}
            onInput={(event) => {
              setUrlValue(event.currentTarget.value);
              setUrlEdited(true);
            }}
          />
          <button type="submit" class="secondary-button">
            Save image
          </button>
        </form>
        <Show when={error()}>
          <p class="error-message" role="alert">
            {error()}
          </p>
        </Show>
      </Show>
    </div>
  );
}
