import { useEffect, useRef, useState } from 'react';

interface AnimatedCounterProps {
  value: number;
  duration?: number;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  className?: string;
}

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

const AnimatedCounter: React.FC<AnimatedCounterProps> = ({
  value,
  duration = 1200,
  prefix = '',
  suffix = '',
  decimals = 0,
  className = '',
}) => {
  const [display, setDisplay] = useState(0);
  const startRef = useRef<number | null>(null);
  const rafRef = useRef<number>(0);
  const prevValue = useRef(0);

  useEffect(() => {
    const from = prevValue.current;
    const to = value;
    startRef.current = null;

    const animate = (timestamp: number) => {
      if (!startRef.current) startRef.current = timestamp;
      const elapsed = timestamp - startRef.current;
      const progress = Math.min(elapsed / duration, 1);
      const easedProgress = easeOutCubic(progress);
      const current = from + (to - from) * easedProgress;
      setDisplay(current);

      if (progress < 1) {
        rafRef.current = requestAnimationFrame(animate);
      } else {
        prevValue.current = to;
      }
    };

    rafRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafRef.current);
  }, [value, duration]);

  const formatted = display.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });

  return (
    <span className={`tabular-nums ${className}`}>
      {prefix}{formatted}{suffix}
    </span>
  );
};

export default AnimatedCounter;
