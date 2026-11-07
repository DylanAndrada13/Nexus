"use client";

import { useEffect, useRef } from "react";

interface Particle {
  x: number;
  y: number;
  size: number;
  speedY: number;
  speedX: number;
  opacity: number;
  fadeSpeed: number;
  wobble: number;
  wobbleSpeed: number;
  wobbleOffset: number;
}

function createParticle(canvasWidth: number, canvasHeight: number): Particle {
  return {
    x: Math.random() * canvasWidth,
    y: canvasHeight + Math.random() * 20,
    size: Math.random() * 2 + 0.5,
    speedY: Math.random() * 1.2 + 0.4,
    speedX: (Math.random() - 0.5) * 0.3,
    opacity: Math.random() * 0.5 + 0.15,
    fadeSpeed: Math.random() * 0.006 + 0.003,
    wobble: 0,
    wobbleSpeed: Math.random() * 0.04 + 0.02,
    wobbleOffset: Math.random() * Math.PI * 2,
  };
}

export function FireParticles({
  count = 90,
  fixed = false,
  className = "",
}: {
  count?: number;
  fixed?: boolean;
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationId: number;
    const particles: Particle[] = [];

    const resize = () => {
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
    };

    resize();

    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    // Sembrar partículas iniciales distribuidas por toda la altura
    for (let i = 0; i < count; i++) {
      const p = createParticle(canvas.width, canvas.height);
      p.y = Math.random() * canvas.height;
      particles.push(p);
    }

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Spawnear nuevas partículas para mantener la densidad
      if (particles.length < count + 30 && Math.random() > 0.4) {
        particles.push(createParticle(canvas.width, canvas.height));
      }

      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];

        p.wobble += p.wobbleSpeed;
        p.y -= p.speedY;
        p.x += p.speedX + Math.sin(p.wobble + p.wobbleOffset) * 0.35;
        p.opacity -= p.fadeSpeed;

        if (p.opacity <= 0 || p.y < -10) {
          particles.splice(i, 1);
          continue;
        }

        // Gradiente radial por partícula: centro más brillante, borde transparente
        const gradient = ctx.createRadialGradient(
          p.x, p.y, 0,
          p.x, p.y, p.size,
        );
        gradient.addColorStop(0, `rgba(255,255,255,${p.opacity})`);
        gradient.addColorStop(0.5, `rgba(230,220,200,${p.opacity * 0.5})`);
        gradient.addColorStop(1, `rgba(200,180,150,0)`);

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = gradient;
        ctx.fill();
      }

      animationId = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      cancelAnimationFrame(animationId);
      ro.disconnect();
    };
  }, [count]);

  return (
    <canvas
      ref={canvasRef}
      className={`pointer-events-none ${
        fixed ? "fixed" : "absolute"
      } inset-0 h-full w-full ${className}`}
      aria-hidden="true"
    />
  );
}
