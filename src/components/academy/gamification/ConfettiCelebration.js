import React, { useEffect, useState, useCallback } from 'react';

/**
 * ConfettiCelebration - Pure CSS/JS confetti animation
 *
 * Features:
 * - No external dependencies
 * - Customizable colors and particle count
 * - Auto-cleanup after animation
 * - Performance optimized
 */
export default function ConfettiCelebration({
  duration = 3000, // ms
  particleCount = 50,
  colors = ['#2D2F8E', '#50C8DF', '#6A469D', '#34B256', '#FACC29', '#F79A30', '#DA2E72'],
  spread = 180, // degrees
}) {
  const [particles, setParticles] = useState([]);

  useEffect(() => {
    // Generate particles
    const newParticles = Array.from({ length: particleCount }, (_, i) => ({
      id: i,
      color: colors[Math.floor(Math.random() * colors.length)],
      left: 50 + (Math.random() - 0.5) * 30, // percentage
      delay: Math.random() * 0.5, // seconds
      angle: -90 + (Math.random() - 0.5) * spread, // degrees from top
      velocity: 50 + Math.random() * 50,
      spin: Math.random() * 720 - 360,
      shape: Math.random() > 0.5 ? 'square' : 'circle',
      size: 8 + Math.random() * 8,
    }));

    setParticles(newParticles);

    // Cleanup after animation
    const timer = setTimeout(() => {
      setParticles([]);
    }, duration);

    return () => clearTimeout(timer);
  }, [particleCount, colors, spread, duration]);

  if (particles.length === 0) return null;

  return (
    <div className="fixed inset-0 pointer-events-none z-[9999] overflow-hidden">
      {particles.map((particle) => (
        <div
          key={particle.id}
          className="absolute animate-confetti-fall"
          style={{
            '--confetti-color': particle.color,
            '--confetti-left': `${particle.left}%`,
            '--confetti-delay': `${particle.delay}s`,
            '--confetti-angle': `${particle.angle}deg`,
            '--confetti-velocity': particle.velocity,
            '--confetti-spin': `${particle.spin}deg`,
            left: `${particle.left}%`,
            top: '-20px',
            width: `${particle.size}px`,
            height: particle.shape === 'square' ? `${particle.size}px` : `${particle.size}px`,
            borderRadius: particle.shape === 'circle' ? '50%' : '2px',
            backgroundColor: particle.color,
            animationDelay: `${particle.delay}s`,
            animationDuration: `${duration}ms`,
          }}
        />
      ))}

      <style>{`
        @keyframes confetti-fall {
          0% {
            transform: translateY(0) translateX(0) rotate(0deg);
            opacity: 1;
          }
          100% {
            transform:
              translateY(100vh)
              translateX(calc(var(--confetti-velocity) * 1px * cos(var(--confetti-angle))))
              rotate(var(--confetti-spin));
            opacity: 0;
          }
        }

        .animate-confetti-fall {
          animation: confetti-fall linear forwards;
        }
      `}</style>
    </div>
  );
}

/**
 * ConfettiBurst - A burst of confetti from a specific point
 */
export function ConfettiBurst({
  x = 50,
  y = 50,
  particleCount = 30,
  duration = 2000,
  colors = ['#2D2F8E', '#50C8DF', '#6A469D', '#34B256', '#FACC29', '#F79A30'],
}) {
  const [particles, setParticles] = useState([]);

  useEffect(() => {
    const newParticles = Array.from({ length: particleCount }, (_, i) => ({
      id: i,
      color: colors[Math.floor(Math.random() * colors.length)],
      angle: (360 / particleCount) * i + (Math.random() - 0.5) * 30,
      velocity: 100 + Math.random() * 150,
      size: 6 + Math.random() * 6,
    }));

    setParticles(newParticles);

    const timer = setTimeout(() => setParticles([]), duration);
    return () => clearTimeout(timer);
  }, [particleCount, colors, duration]);

  if (particles.length === 0) return null;

  return (
    <div className="fixed inset-0 pointer-events-none z-[9999]">
      {particles.map((particle) => (
        <div
          key={particle.id}
          className="absolute rounded-full animate-burst"
          style={{
            left: `${x}%`,
            top: `${y}%`,
            width: `${particle.size}px`,
            height: `${particle.size}px`,
            backgroundColor: particle.color,
            '--burst-angle': `${particle.angle}deg`,
            '--burst-velocity': `${particle.velocity}px`,
            animationDuration: `${duration}ms`,
          }}
        />
      ))}

      <style>{`
        @keyframes burst {
          0% {
            transform: translate(-50%, -50%) translateX(0) translateY(0) scale(1);
            opacity: 1;
          }
          100% {
            transform:
              translate(-50%, -50%)
              translateX(calc(cos(var(--burst-angle)) * var(--burst-velocity)))
              translateY(calc(sin(var(--burst-angle)) * var(--burst-velocity)))
              scale(0);
            opacity: 0;
          }
        }

        .animate-burst {
          animation: burst ease-out forwards;
        }
      `}</style>
    </div>
  );
}

/**
 * useConfetti - Hook to trigger confetti programmatically
 */
export function useConfetti() {
  const [showConfetti, setShowConfetti] = useState(false);
  const [confettiProps, setConfettiProps] = useState({});

  const trigger = useCallback((props = {}) => {
    setConfettiProps(props);
    setShowConfetti(true);
    setTimeout(() => setShowConfetti(false), props.duration || 3000);
  }, []);

  const Confetti = showConfetti ? <ConfettiCelebration {...confettiProps} /> : null;

  return { trigger, Confetti };
}
