# Landing page images

The landing page ships with flat **placeholder** pictures so it looks finished before the real photographs exist. Replacing a
placeholder never needs a code change: save your image under the file's name in `assets/landing-source/` and run

```bash
npm run landing:images
```

That crops each image to the size the page uses (`lib/landing/image-specs.mjs`), compresses it, and writes it to
`public/landing/<name>.jpg`. A name with no source image keeps its placeholder, so you can replace them one at a time.
Any of `.png`, `.jpg`, `.jpeg` or `.webp` works as a source, at any size (the larger the better; it is cropped, never stretched).

## Eleven pictures

| File | Where it is used | Shape | Generate at |
| --- | --- | --- | --- |
| `hero-campus` | Hero, under the headline (cropped to portrait on a phone). Gets the WebGL ripple on desktop | Wide 16:9 | 1536 × 1024 |
| `story-campus` | Full-width picture that opens to fill the screen while the page holds | Landscape 16:9 | 1536 × 1024 |
| `gallery-projects` | "What you will find" tile 1 | Portrait 4:5 | 1024 × 1536 |
| `gallery-mentors` | Tile 2 | Portrait 4:5 | 1024 × 1536 |
| `gallery-events` | Tile 3 | Portrait 4:5 | 1024 × 1536 |
| `club-robotics`, `club-design`, `club-startup`, `club-debate`, `club-music`, `club-sports` | The circle that follows the pointer along the communities list | Square 1:1 | 1024 × 1024 |

## How to ask for clean pictures

Paste the **style block** after each prompt below. It is what keeps the set looking like one photographer shot it, in the
page's black, charcoal and warm off-white palette with one touch of vivid blue, and with no text or logos to retouch.

> **Style block.** Editorial documentary photograph, shot on a 35mm lens, natural daylight, shallow depth of field, realistic
> skin texture and hands, candid unposed expressions, calm uncluttered composition with generous negative space, muted colour
> palette of black, charcoal and warm off-white with a single touch of vivid royal blue (a jacket, a mug or a notebook). No text, no captions, no logos, no
> signage, no brand names, no watermark, no extra or distorted fingers, no illustration, no 3D render, no stock-photo smiles.
> Young adults in their late teens and early twenties on an Indian college campus; do not depict any real college, building,
> uniform or identifiable person.

### Hero (`hero-campus`, wide)

> Three university students gathered around a wooden table in a sunlit courtyard of a college campus, seen in a wide frame. One
> points at an open laptop, another sketches in a notebook, the third laughs. A modern low-rise building in warm sandstone and glass
> is softly out of focus behind them. Late-afternoon light. Keep the group in the middle of the frame, with calm space on the far
> left and right.

Two product cards sit over the **lower-left** and **upper-right** of this picture, so keep faces in the middle.

### Story (`story-campus`, landscape)

> Wide shot of a university campus plaza at golden hour. Small groups of students walk and talk between low modern buildings and
> mature trees, long soft shadows, a sense of calm and order. Slightly elevated camera angle. No recognisable landmark. Large
> areas of quiet paving and sky.

White headline text is laid over the **left half** of this picture, so ask for the calmer, darker areas there.

### Gallery (portrait)

- **`gallery-projects`**: Close view of a small student team assembling a hardware prototype on a workbench: hands holding a
  circuit board, a laptop with out-of-focus code, a soldering iron, a notebook with sketches. Cool window light.
- **`gallery-mentors`**: A final-year student mentoring a first-year at a café table on campus. A notebook and a laptop sit between
  them; the senior explains with a gesture, the junior listens and takes notes. Warm window light.
- **`gallery-events`**: A campus hackathon or workshop. Rows of students with laptops at long tables, a speaker at a lectern
  blurred in the background, warm ceiling lights, two students in the foreground leaning over one laptop.

### Communities (square)

Frame each one close, with one clear subject, because it is shown in a circle about 240 px across.

- **`club-robotics`**: A small wheeled robot on a lab table, a student's hands adjusting it, teammates blurred behind. Cool light.
- **`club-design`**: A studio wall covered in sticky notes and printed sketches, a hand pinning one note. Warm neutral tones.
- **`club-startup`**: A student at a whiteboard presenting a simple pitch to a small blurred audience, marker in hand.
- **`club-debate`**: A student at a lectern, one hand raised mid-gesture, a blurred audience in the foreground, soft side light.
- **`club-music`**: Students playing acoustic guitar and a hand drum on campus steps, cropped close to hands and instruments, golden light.
- **`club-sports`**: Students passing a ball on an outdoor court, light motion blur, low angle, dusk light.

## Before you publish

- Pictures of people made by an image model are not photographs of real members. The page already labels its mock interface as
  "Illustrative example"; if you use generated people, consider a short "Illustrative images" note near the gallery.
- Check each picture for stray text, warped hands and logos before exporting; regenerate rather than retouch.
- `hero-campus` is loaded as a WebGL texture on desktop. Keep it under about 400 KB after export (the script does this), and
  use a plain, non-busy subject: the ripple reads best on large calm areas.
