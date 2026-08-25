'use client';

import { useEffect, useState } from 'react';

/**
 * The opening: a striker hits it, the ball comes at the camera, the app arrives.
 *
 * Harvested from the intro built for World Cup Intelligence and re-fitted:
 * same 2.8-second beat, same blurred-trail ball, club colours instead of
 * national ones, and the product's own tokens rather than a fixed palette — so
 * it opens in whichever of the five colourways the reader chose rather than
 * announcing itself in a sixth.
 *
 * ── Once per session, and never in front of someone who asked it not to ────
 * `sessionStorage`, not `localStorage`: an intro that plays exactly once and
 * then never again is a thing most people never see, and one that plays on
 * every navigation is an obstacle. Once per tab is the honest middle. Under
 * `prefers-reduced-motion` it is marked seen and skipped outright — a
 * screen-filling ball rushing the camera is precisely what that setting is
 * asking not to happen, and a faster version of it is not a concession.
 *
 * A click anywhere skips it, and the skip affordance says so.
 *
 * ── Why the decision is made before paint ──────────────────────────────────
 * Deciding in an effect means React renders the app first, paints it, and only
 * then covers it — a frame of the product you are about to be introduced to.
 * So `introScript` runs in <head> alongside the theme and rail scripts, marks
 * the document, and the stylesheet paints an opaque cover on the very first
 * frame. This component then takes that cover over. If it never mounts — a
 * chunk that fails to load, an error in the tree above it — the same script
 * pulls the attribute after four seconds, so the worst case is a short black
 * screen rather than a permanently hidden app.
 */
export function IntroSplash() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const root = document.documentElement;
    if (root.getAttribute('data-intro') !== '1') return;

    setShow(true);
    const done = () => {
      root.removeAttribute('data-intro');
      setShow(false);
    };
    const t = setTimeout(done, 2800);
    return () => {
      clearTimeout(t);
      root.removeAttribute('data-intro');
    };
  }, []);

  if (!show) return null;

  return (
    <div
      className="cfi-splash"
      onClick={() => {
        document.documentElement.removeAttribute('data-intro');
        setShow(false);
      }}
      role="presentation"
    >
      <style>{`
        .cfi-splash{position:fixed;inset:-24px;z-index:200;overflow:hidden;cursor:pointer;
          background:radial-gradient(120% 120% at 50% 42%,
            color-mix(in oklab, var(--surface-2) 92%, var(--brand)) 0%,
            var(--surface-canvas) 62%, #000 100%);
          animation:cfiFade 2.8s ease forwards, cfiShake 2.8s ease both;}

        /* Speed lines. A conic repeat masked out of the middle, so it reads as
           the world rushing past rather than as a pattern on top of it. */
        .cfi-speed{position:absolute;inset:0;z-index:1;opacity:0;
          background:repeating-conic-gradient(from 0deg at 50% 50%,
            transparent 0 5deg, color-mix(in oklab, var(--brand) 22%, transparent) 5deg 6.2deg);
          -webkit-mask:radial-gradient(circle at 50% 50%, transparent 22%, #000 64%);
                  mask:radial-gradient(circle at 50% 50%, transparent 22%, #000 64%);
          animation:cfiSpeed 2.8s ease forwards;}

        .cfi-striker{position:absolute;z-index:2;left:50%;bottom:0;
          max-height:min(92vh,880px);max-width:92vw;width:auto;height:auto;
          transform-origin:50% 100%;animation:cfiStriker 2.8s cubic-bezier(.2,.7,.3,1) forwards;
          -webkit-user-drag:none;user-select:none;}

        /* A pitch band over the photograph's gravel strip. Dark, because this
           stage is not a floodlit afternoon. */
        .cfi-ground{position:absolute;z-index:3;left:0;right:0;bottom:0;height:22vh;opacity:0;
          background:
            repeating-linear-gradient(93deg, rgba(255,255,255,.035) 0 5%, rgba(0,0,0,.10) 5% 10%),
            linear-gradient(180deg, #1d3a20 0%, #142a17 46%, #0a140c 100%);
          -webkit-mask:linear-gradient(180deg, transparent 0, #000 30%);
                  mask:linear-gradient(180deg, transparent 0, #000 30%);
          animation:cfiGround 2.8s ease forwards;}

        .cfi-word{position:absolute;z-index:3;left:0;right:0;top:7%;text-align:center;
          color:var(--text-primary);animation:cfiWord 2.8s ease forwards;}
        .cfi-word b{display:block;font-family:var(--font-display);font-weight:600;
          font-size:clamp(20px,4.2vmin,38px);letter-spacing:-.01em;}
        .cfi-word small{display:block;margin-top:.7em;font-size:clamp(9px,1.5vmin,12px);
          letter-spacing:.32em;text-transform:uppercase;color:var(--brand);font-weight:600;}

                /* The stage is inset by -24px so the shake never exposes an edge, which
           means anything pinned to a corner is that far outside the viewport.
           The pill was being cut in half by it. */
        .cfi-skip{position:absolute;z-index:3;right:40px;bottom:38px;color:var(--text-secondary);
          font-size:12px;letter-spacing:.06em;background:color-mix(in oklab, var(--surface-1) 80%, transparent);
          border:1px solid var(--border-subtle);padding:5px 11px;border-radius:999px;
          animation:cfiWord 2.8s ease forwards;}

        /* The curtain is the app's own ground colour, so the wipe lands on the
           page rather than on a black frame in front of it. */
        .cfi-curtain{position:absolute;inset:0;z-index:4;opacity:0;background:var(--surface-canvas);
          animation:cfiCurtain 2.8s ease forwards;}
        .cfi-flash{position:absolute;inset:0;z-index:5;opacity:0;
          background:radial-gradient(circle at 50% 50%,
            color-mix(in oklab, var(--brand) 90%, white) 0%,
            color-mix(in oklab, var(--brand) 45%, transparent) 30%, transparent 62%);
          animation:cfiFlash 2.8s ease forwards;}

        /* One sharp ball and five blurred ghosts staggered behind it. A single
           sprite with a motion blur filter reads as a smudge; a trail reads as
           speed, because that is what a camera actually records. */
        .cfi-ball{position:absolute;left:50%;top:50%;width:15vmin;height:15vmin;
          will-change:transform,opacity;clip-path:circle(39% at 50% 50%);
          animation:cfiBallMove 2.8s cubic-bezier(.42,.05,.55,1) forwards, cfiBallIn 2.8s ease forwards;}
        .cfi-ball.lead{z-index:11;filter:drop-shadow(0 0 30px color-mix(in oklab, var(--brand) 60%, transparent));}
        .cfi-ball.t1{z-index:10;opacity:.66;filter:blur(3px);animation:cfiBallMove 2.8s cubic-bezier(.42,.05,.55,1) 55ms both;}
        .cfi-ball.t2{z-index:9;opacity:.54;filter:blur(5px);animation:cfiBallMove 2.8s cubic-bezier(.42,.05,.55,1) 120ms both;}
        .cfi-ball.t3{z-index:8;opacity:.43;filter:blur(8px);animation:cfiBallMove 2.8s cubic-bezier(.42,.05,.55,1) 195ms both;}
        .cfi-ball.t4{z-index:7;opacity:.32;filter:blur(11px);animation:cfiBallMove 2.8s cubic-bezier(.42,.05,.55,1) 280ms both;}
        .cfi-ball.t5{z-index:6;opacity:.22;filter:blur(15px);animation:cfiBallMove 2.8s cubic-bezier(.42,.05,.55,1) 375ms both;}

        @keyframes cfiFade{0%,93%{opacity:1}100%{opacity:0;visibility:hidden}}
        @keyframes cfiShake{0%,80%{transform:translate(0,0)}
          82%{transform:translate(-9px,6px)}84%{transform:translate(8px,-7px)}86%{transform:translate(-6px,5px)}
          88%{transform:translate(4px,-3px)}90%{transform:translate(-3px,2px)}92%{transform:translate(2px,-1px)}
          94%,100%{transform:translate(0,0)}}
        @keyframes cfiWord{0%,12%{opacity:0;transform:translateY(8px)}30%{opacity:1;transform:translateY(0)}66%{opacity:1}78%{opacity:0}}
        @keyframes cfiSpeed{0%,22%{opacity:0}48%{opacity:.95}84%{opacity:.6}100%{opacity:0}}
        @keyframes cfiCurtain{0%,78%{opacity:0}92%{opacity:1}100%{opacity:1}}
        @keyframes cfiFlash{0%,82%{opacity:0}90%{opacity:.9}100%{opacity:0}}
        @keyframes cfiStriker{0%{opacity:0;transform:translateX(-50%) scale(1.07)}12%{opacity:1}26%{transform:translateX(-50%) scale(1)}100%{opacity:1;transform:translateX(-50%) scale(1)}}
        @keyframes cfiGround{0%{opacity:0}14%{opacity:1}100%{opacity:1}}
        @keyframes cfiBallIn{0%{opacity:0}8%{opacity:1}100%{opacity:1}}
        @keyframes cfiBallMove{
          0%{transform:translate(-50%,-50%) translate(-13vw,25vh) scale(.10) rotate(0)}
          8%{transform:translate(-50%,-50%) translate(-13vw,25vh) scale(.10) rotate(0)}
          16%{transform:translate(-50%,-50%) translate(-14vw,18vh) scale(.34) rotate(120deg)}
          46%{transform:translate(-50%,-50%) translate(-12vw,10vh) scale(1.2) rotate(320deg)}
          74%{transform:translate(-50%,-50%) translate(-7vw,2vh) scale(4.0) rotate(620deg)}
          100%{transform:translate(-50%,-50%) translate(0,-1vh) scale(17) rotate(980deg)}}

        /* Belt and braces. The pre-paint script already declines to mark the
           document for anyone with this set, so this branch should be
           unreachable — but an intro is exactly the kind of thing that must
           not depend on one guard. */
        @media (prefers-reduced-motion: reduce){
          .cfi-splash{animation:cfiFade .3s forwards}
          .cfi-ball,.cfi-striker,.cfi-speed,.cfi-flash,.cfi-curtain{animation:none}
          .cfi-ball.t1,.cfi-ball.t2,.cfi-ball.t3,.cfi-ball.t4,.cfi-ball.t5{display:none}
        }
      `}</style>

      <div className="cfi-speed" />

      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="cfi-striker" src="/intro/striker-club.webp" alt="" aria-hidden="true" decoding="async" />

      <div className="cfi-ground" />

      <div className="cfi-word">
        <b>Club Football Intelligence</b>
        <small>Task Enterprises</small>
      </div>
      <div className="cfi-skip">tap to skip ›</div>

      <div className="cfi-curtain" />
      <div className="cfi-flash" />

      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="cfi-ball t5" src="/intro/ball-club.webp" alt="" aria-hidden="true" decoding="async" />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="cfi-ball t4" src="/intro/ball-club.webp" alt="" aria-hidden="true" decoding="async" />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="cfi-ball t3" src="/intro/ball-club.webp" alt="" aria-hidden="true" decoding="async" />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="cfi-ball t2" src="/intro/ball-club.webp" alt="" aria-hidden="true" decoding="async" />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="cfi-ball t1" src="/intro/ball-club.webp" alt="" aria-hidden="true" decoding="async" />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="cfi-ball lead" src="/intro/ball-club.webp" alt="" aria-hidden="true" decoding="async" />
    </div>
  );
}

/**
 * Decides, before first paint, whether the intro is playing — and covers the
 * page if it is.
 *
 * The dead-man's switch matters more than it looks. This attribute makes the
 * stylesheet hide the entire app; if the component that clears it never mounts,
 * the product is a black rectangle. Four seconds is longer than the intro and
 * shorter than anyone's patience.
 */
export const introScript = `(function(){try{` +
  `if(new URLSearchParams(location.search).get('intro')==='0'){` +
  `sessionStorage.setItem('cfi-intro-seen','1');return;}` +
  `if(sessionStorage.getItem('cfi-intro-seen'))return;` +
  `sessionStorage.setItem('cfi-intro-seen','1');` +
  `if(window.matchMedia('(prefers-reduced-motion: reduce)').matches)return;` +
  `var r=document.documentElement;r.setAttribute('data-intro','1');` +
  `setTimeout(function(){r.removeAttribute('data-intro');},4000);` +
  `}catch(e){}})();`;
