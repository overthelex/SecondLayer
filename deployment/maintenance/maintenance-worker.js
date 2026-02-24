/**
 * SecondLayer Maintenance Mode Worker
 * Served by Cloudflare edge during backend redeployment.
 * Returns HTTP 503 with a branded bilingual maintenance page.
 */

const MAINTENANCE_HTML = `<!DOCTYPE html>
<html lang="uk">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="refresh" content="60">
  <title>SecondLayer — Технічне обслуговування / Maintenance</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Crimson+Pro:ital,wght@0,400;0,600;1,400&family=Inter:wght@400;500&display=swap" rel="stylesheet">
  <style>
    *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }

    body {
      min-height: 100vh;
      background: #F5F5F0;
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      color: #2D2D2D;
    }

    .container {
      text-align: center;
      padding: 3rem 2rem;
      max-width: 540px;
      width: 100%;
    }

    .logo-scene {
      perspective: 1400px;
      width: 120px;
      height: 120px;
      margin: 0 auto 2rem;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .logo-3d {
      width: 100%;
      height: 100%;
      position: relative;
      transform-style: preserve-3d;
      animation: spin 12s linear infinite;
    }
    @keyframes spin {
      from { transform: rotateY(0deg); }
      to   { transform: rotateY(360deg); }
    }
    .logo-face, .logo-slice {
      position: absolute;
      top: 50%; left: 50%;
      width: 95%; height: 95%;
      margin: -47.5% 0 0 -47.5%;
      transform-style: preserve-3d;
      pointer-events: none;
    }
    .logo-face { backface-visibility: visible; }
    .logo-face svg, .logo-slice svg { width: 100%; height: 100%; display: block; }

    .brand {
      font-family: 'Crimson Pro', Georgia, 'Times New Roman', serif;
      font-size: 1.5rem;
      font-weight: 600;
      letter-spacing: .06em;
      text-transform: uppercase;
      color: #2D2D2D;
      margin-bottom: 2rem;
    }
    .brand em { color: #D97757; font-style: normal; }

    .divider {
      width: 44px;
      height: 2px;
      background: linear-gradient(90deg, #D97757, #E8A07D);
      margin: 0 auto 2.25rem;
      border-radius: 2px;
    }

    .msg-en {
      font-family: 'Crimson Pro', Georgia, serif;
      font-size: 2.4rem;
      font-weight: 600;
      line-height: 1.15;
      color: #2D2D2D;
      margin-bottom: .6rem;
    }

    .msg-uk {
      font-family: 'Crimson Pro', Georgia, serif;
      font-size: 1.9rem;
      font-weight: 400;
      font-style: italic;
      line-height: 1.25;
      color: #6B6B6B;
      margin-bottom: 2.25rem;
    }

    .sub {
      font-size: .875rem;
      color: #888;
      line-height: 1.8;
    }

    .dots {
      display: inline-flex;
      gap: 7px;
      margin-top: 2.5rem;
    }
    .dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: #D97757;
      animation: bounce 1.5s ease-in-out infinite;
    }
    .dot:nth-child(2) { animation-delay: .22s; }
    .dot:nth-child(3) { animation-delay: .44s; }

    @keyframes bounce {
      0%, 80%, 100% { transform: scale(.55); opacity: .35; }
      40%           { transform: scale(1);   opacity: 1;   }
    }

    @media (max-width: 480px) {
      .msg-en { font-size: 1.9rem; }
      .msg-uk { font-size: 1.5rem; }
    }
  </style>
</head>
<body>
  <div class="container">

    <!-- 3D spinning LX logo (built from hardcoded SVG paths, no user input) -->
    <div class="logo-scene">
      <div class="logo-3d" id="logo3d"></div>
    </div>

    <div class="brand">Second<em>Layer</em></div>
    <div class="divider"></div>

    <div class="msg-en">We'll be right back!</div>
    <div class="msg-uk">Ми незабаром повернемося!</div>

    <p class="sub">
      Scheduled system update in progress.<br>
      Виконується планове оновлення системи.
    </p>

    <div class="dots">
      <div class="dot"></div>
      <div class="dot"></div>
      <div class="dot"></div>
    </div>

  </div>
  <script>
  (function(){
    var depth=2,half=depth/2,edge='#1E2838',
      pL='M2647 7105 c-170 -50 -322 -140 -454 -268 -182 -176 -310 -434 -327 -657 -3 -36 -8 -628 -11 -1316 -6 -1333 -5 -1394 41 -1574 89 -353 424 -690 784 -789 41 -12 121 -25 179 -31 106 -9 2806 -22 2854 -13 26 5 62 -49 -554 829 l-78 112 -948 7 c-881 7 -952 9 -1008 26 -159 49 -286 185 -330 354 -13 52 -15 259 -15 1702 l0 1643 -27 -1 c-16 0 -63 -11 -106 -24z',
      pX1='M3340 6983 c56 -82 146 -211 200 -288 54 -77 136 -194 182 -260 47 -66 149 -212 228 -325 79 -113 173 -248 210 -300 36 -52 106 -151 155 -220 49 -69 170 -240 268 -380 242 -344 333 -473 534 -755 93 -132 241 -341 328 -465 87 -124 215 -306 285 -405 128 -181 169 -239 453 -640 86 -121 198 -280 249 -352 l93 -133 593 0 c325 0 592 3 592 6 0 5 -94 139 -380 544 -92 129 -243 343 -337 475 -93 132 -217 308 -275 390 -100 144 -208 296 -528 745 -81 113 -245 345 -365 515 -295 419 -386 548 -540 765 -72 102 -176 248 -230 325 -54 77 -124 176 -155 220 -31 44 -121 172 -200 285 -79 113 -174 249 -212 303 l-69 97 -590 0 -590 0 101 -147z',
      pX2='M6489 7013 c-45 -65 -120 -174 -167 -243 -92 -135 -341 -496 -484 -702 -48 -70 -88 -130 -88 -133 0 -2 87 -130 193 -282 106 -153 241 -346 299 -430 l105 -151 89 131 c193 284 264 389 380 557 66 96 174 254 239 350 65 96 151 222 190 280 39 58 138 204 220 325 82 121 173 256 203 300 30 44 58 88 63 98 9 16 -21 17 -575 17 l-584 0 -83 -117z',
      gt='translate(0,960) scale(0.1,-0.1)',
      el=document.getElementById('logo3d');
    function mkSvg(c1,c2){
      var ns='http://www.w3.org/2000/svg';
      var s=document.createElementNS(ns,'svg');
      s.setAttribute('viewBox','0 0 960 960');
      var g=document.createElementNS(ns,'g');
      g.setAttribute('transform',gt);
      g.setAttribute('stroke','none');
      [[c1,pL],[c2,pX1],[c2,pX2]].forEach(function(p){
        var path=document.createElementNS(ns,'path');
        path.setAttribute('fill',p[0]);
        path.setAttribute('d',p[1]);
        g.appendChild(path);
      });
      s.appendChild(g);
      return s;
    }
    function face(z,c1,c2){var d=document.createElement('div');d.className='logo-face';d.style.transform='translateZ('+z+'px)';d.appendChild(mkSvg(c1,c2));return d;}
    function slice(z){var d=document.createElement('div');d.className='logo-slice';d.style.transform='translateZ('+z+'px)';d.appendChild(mkSvg(edge,edge));return d;}
    var n=8,st=depth/(n+1);
    el.appendChild(face(-half,'#1E2838','#5C7C9E'));
    for(var i=1;i<=n;i++) el.appendChild(slice(-half+i*st));
    el.appendChild(face(half,'#1E2838','#5C7C9E'));
  })();
  </script>
</body>
</html>`;

addEventListener('fetch', event => {
  event.respondWith(
    new Response(MAINTENANCE_HTML, {
      status: 503,
      headers: {
        'Content-Type':  'text/html; charset=UTF-8',
        'Retry-After':   '300',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'X-Robots-Tag':  'noindex, nofollow',
      },
    })
  );
});
