/* Mirrors tihomir-selak-blog-2026/src/components/SynapseMark.astro, keep in sync. */
const outline =
  'M12 4.6C10.5 3 7.5 3 6.2 5C4 5.3 2.8 7.5 3.6 9.3C2.4 10.6 2.6 13 4 14C3.8 16 5.5 17.5 7.3 17.3C8.4 19 10.6 19.3 12 18C13.4 19.3 15.6 19 16.7 17.3C18.5 17.5 20.2 16 20 14C21.4 13 21.6 10.6 20.4 9.3C21.2 7.5 20 5.3 17.8 5C16.5 3 13.5 3 12 4.6Z';
const fissure = 'M12 4.6C11 8.5 13 12.5 12 18';

export default function SynapseMark(props: { size?: number }) {
  const size = () => props.size ?? 22;
  return (
    <svg
      class="synapse-mark"
      viewBox="0 0 24 24"
      width={size()}
      height={size()}
      aria-hidden="true"
    >
      <g
        fill="none"
        stroke="currentColor"
        stroke-width="1.4"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <path d={outline} />
        <path d={fissure} opacity="0.7" />
        <path
          d="M7.6 9.2 8.6 14.2M15.6 8.6 16.2 13.8M7.6 9.2 15.6 8.6"
          stroke-width="1.1"
        />
      </g>
      <g fill="currentColor">
        <circle cx="7.6" cy="9.2" r="1.3" />
        <circle cx="8.6" cy="14.2" r="1.3" />
        <circle cx="16.2" cy="13.8" r="1.3" />
      </g>
      <circle class="synapse-mark__hub" cx="15.6" cy="8.6" r="1.9" />
    </svg>
  );
}
