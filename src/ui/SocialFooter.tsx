// Subtle socials footer (shared by the main menu + pause screen). Pure links,
// no app state. Glows to each brand's hue on hover.

export function SocialFooter({ className = '' }: { className?: string }) {
  // The UI mounts in a pointer-events-none layer (ui-root); each link opts back
  // in so hover/click work even when the footer sits outside a menu container.
  return (
    <div className={`pointer-events-none flex justify-center gap-6 text-white/40 ${className}`}>
      <a
        href="https://www.instagram.com/floflup"
        target="_blank"
        rel="noopener noreferrer"
        className="pointer-events-auto transition hover:text-[#ff2fd6] hover:drop-shadow-[0_0_8px_rgba(255,47,214,0.8)]"
        aria-label="Instagram"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
          <path d="M16.11 7.5v.01" />
          <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
        </svg>
      </a>
      <a
        href="https://github.com/laubsauger"
        target="_blank"
        rel="noopener noreferrer"
        className="pointer-events-auto transition hover:text-white hover:drop-shadow-[0_0_8px_rgba(255,255,255,0.8)]"
        aria-label="GitHub"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4" />
          <path d="M9 18c-4.51 2-5-2-7-2" />
        </svg>
      </a>
      <a
        href="https://www.youtube.com/@laub69"
        target="_blank"
        rel="noopener noreferrer"
        className="pointer-events-auto transition hover:text-[#ff0000] hover:drop-shadow-[0_0_8px_rgba(255,0,0,0.8)]"
        aria-label="YouTube"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M2.5 17a24.12 24.12 0 0 1 0-10 2 2 0 0 1 1.4-1.4 49.56 49.56 0 0 1 16.2 0A2 2 0 0 1 21.5 7a24.12 24.12 0 0 1 0 10 2 2 0 0 1-1.4 1.4 49.55 49.55 0 0 1-16.2 0A2 2 0 0 1 2.5 17" />
          <path d="m10 15 5-3-5-3z" />
        </svg>
      </a>
    </div>
  );
}
