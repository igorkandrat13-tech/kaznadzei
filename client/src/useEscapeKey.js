import { useEffect, useRef } from 'react';

function useEscapeKey(onEscape, enabled = true) {
  const onEscapeRef = useRef(onEscape);

  useEffect(() => {
    onEscapeRef.current = onEscape;
  }, [onEscape]);

  useEffect(() => {
    if (!enabled) return undefined;

    const handleKeyDown = (event) => {
      if (event.key !== 'Escape') return;
      if (typeof onEscapeRef.current === 'function') {
        onEscapeRef.current(event);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [enabled]);
}

export default useEscapeKey;
