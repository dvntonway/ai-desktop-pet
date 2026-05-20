/* Petto — script.js */

// ── Navbar scroll effect ──────────────────────────────────────────────
const navbar = document.getElementById('navbar');
window.addEventListener('scroll', () => {
  navbar.classList.toggle('scrolled', window.scrollY > 20);
});

// ── Scroll reveal ─────────────────────────────────────────────────────
const revealTargets = [
  '#hero-cta', '#hero-learn', '#hero-pet-img', '.hero-badge',
  '#step-1', '#step-2', '#step-3',
  '#uc-1', '#uc-2', '#uc-3', '#uc-4',
  '#gc-cat', '#gc-monkey', '#gc-dog', '#gc-fox', '#gc-ghost',
  '#plan-free', '#plan-pro',
  '.section-title', '.section-sub', '.section-label',
];

document.querySelectorAll(
  '.step-card, .use-card, .gallery-card, .plan-card, .hero-content, .hero-pet, .section-title, .section-sub, .section-label, .gallery-cta'
).forEach((el, i) => {
  el.classList.add('reveal');
  el.style.transitionDelay = `${i * 0.06}s`;
});

const observer = new IntersectionObserver((entries) => {
  entries.forEach(e => {
    if (e.isIntersecting) {
      e.target.classList.add('visible');
      observer.unobserve(e.target);
    }
  });
}, { threshold: 0.12 });

document.querySelectorAll('.reveal').forEach(el => observer.observe(el));

// ── Rotating hero speech bubbles ──────────────────────────────────────
const bubbles = [
  "😤 Still scrolling Twitter?\nAt 2pm on a Tuesday?!",
  "🍿 Episode 6? It's 2am.\nSeriously?",
  "💻 Oh, you pushed a commit!\nI'm so proud of you! 🎉",
  "😑 That tab has been open\nfor 4 days now...",
  "🔥 Deadline in 2 hours.\nMaybe close Reddit?",
  "👀 YouTube again?\nThis is the 8th video.",
];

const bubble = document.querySelector('.hero-bubble');
let bubbleIdx = 0;

function rotateBubble() {
  bubble.style.opacity = '0';
  bubble.style.transform = 'scale(0.85)';
  setTimeout(() => {
    bubbleIdx = (bubbleIdx + 1) % bubbles.length;
    bubble.textContent = bubbles[bubbleIdx];
    bubble.style.transition = 'opacity 0.4s ease, transform 0.4s cubic-bezier(0.34,1.56,0.64,1)';
    bubble.style.opacity = '1';
    bubble.style.transform = 'scale(1)';
  }, 300);
}

setInterval(rotateBubble, 3200);

// ── Gallery card selection ────────────────────────────────────────────
document.querySelectorAll('.gallery-card').forEach(card => {
  card.addEventListener('click', () => {
    // Locked cards scroll to pricing instead
    if (card.classList.contains('gallery-card-locked')) {
      const pricing = document.getElementById('pricing');
      if (pricing) pricing.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }

    document.querySelectorAll('.gallery-card').forEach(c => {
      c.style.borderColor = '';
      c.style.boxShadow = '';
    });
    card.style.borderColor = 'var(--orange)';
    card.style.boxShadow = '0 8px 40px rgba(241,119,32,0.28)';

    // Bounce the pet SVG or image
    const pet = card.querySelector('img, svg');
    if (pet) {
      pet.style.transition = 'transform 0.5s cubic-bezier(0.34,1.56,0.64,1)';
      pet.style.transform = 'scale(1.25) rotate(-8deg)';
      setTimeout(() => { pet.style.transform = ''; }, 500);
    }
  });
});

// ── Smooth nav link scrolling (internal anchors only) ────────────────
document.querySelectorAll('a[href^="#"]').forEach(link => {
  link.addEventListener('click', e => {
    const href = link.getAttribute('href');
    if (!href || href === '#') return;
    const target = document.querySelector(href);
    if (target) {
      e.preventDefault();
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });
});

// ── Floating pets subtle parallax ────────────────────────────────────
const floatPets = document.querySelectorAll('.float-pet');
window.addEventListener('scroll', () => {
  const scrollY = window.scrollY;
  floatPets.forEach((pet, i) => {
    const speed = 0.04 + i * 0.015;
    pet.style.transform = `translateY(${scrollY * speed}px)`;
  });
});
