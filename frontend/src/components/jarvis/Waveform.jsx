import { useEffect, useState } from "react";

// Pure-CSS animated bar visualizer. Active = animates; idle = flat baseline.
export const Waveform = ({ active = false, color = "#ffffff", bars = 28 }) => {
  const [heights, setHeights] = useState(() => Array(bars).fill(6));

  useEffect(() => {
    if (!active) {
      setHeights(Array(bars).fill(6));
      return;
    }
    const id = setInterval(() => {
      setHeights((prev) =>
        prev.map(() => 6 + Math.round(Math.random() * 38))
      );
    }, 90);
    return () => clearInterval(id);
  }, [active, bars]);

  return (
    <div
      className="flex items-center gap-[3px] h-[48px]"
      data-testid="jarvis-waveform"
      style={{ color }}
    >
      {heights.map((h, i) => (
        <div
          key={i}
          className="bar"
          style={{ height: `${h}px` }}
        />
      ))}
    </div>
  );
};
