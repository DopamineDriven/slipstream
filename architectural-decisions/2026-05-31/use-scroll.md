# useScroll

`useScroll` is used to create scroll-linked animations, like progress indicators and parallax effects.

```
const { scrollYProgress } = useScroll()

return <motion.div style={{ scaleX: scrollYProgress }} />
```

`useScroll` is able to run some animations with the browser's `ScrollTimeline`[API](https://developer.mozilla.org/en-US/docs/Web/API/ScrollTimeline) for optimal hardware-accelerated performance, removing scroll measurements, improving scroll synchronisation and ensuring animations remain smooth even under heavy CPI usage.

## Usage

Import `useScroll` from Motion:

```tsx
import { useScroll } from "motion/react"
```

`useScroll` returns four [motion values](/docs/react-motion-value):

- `scrollX`/`Y`: The absolute scroll position, in pixels.
- `scrollXProgress`/`YProgress`: The scroll position between the defined offsets, as a value between `0` and `1`.

### Page scroll

By default, useScroll tracks the page scroll.

```tsx
const { scrollY } = useScroll()

useMotionValueEvent(scrollY, "change", (latest) => {
  console.log("Page scroll: ", latest)
})
```

For example, we could show a page scroll indicator by passing `scrollYProgress` straight to the `scaleX` style of a progress bar.


```tsx
"use client"

import { motion, useScroll } from "motion/react"

export default function ScrollLinked() {
    const { scrollYProgress } = useScroll()

    return (
        <>
            <motion.div
                id="scroll-indicator"
                style={{
                    scaleX: scrollYProgress,
                    position: "fixed",
                    top: 0,
                    left: 0,
                    right: 0,
                    height: 10,
                    originX: 0,
                    backgroundColor: "var(--hue-1)",
                }}
            />
            <Content />
        </>
    )
}

/**
 * ==============   Utils   ================
 */

function Content() {
    return (
        <>
            <article
                style={{
                    maxWidth: 500,
                    padding: "150px 20px",
                    display: "flex",
                    flexDirection: "column",
                    gap: 20,
                }}
            >
              {/*long body of p and h2 tags*/}
            </article>
        </>
    )
}
```

```tsx
const { scrollYProgress } = useScroll()

return <motion.div style={{ scaleX: scrollYProgress }} />
```

*Live example:* https://examples.motion.dev/react/scroll-linked?utm_source=embed

As `useScroll` returns motion values, we can compose this scroll info with other motion value hooks like `useTransform` and `useSpring`:

```tsx
const { scrollYProgress } = useScroll()
const scaleX = useSpring(scrollYProgress)

return <motion.div style={{ scaleX }} />
```

```tsx
"use client"

import { motion, useSpring, useScroll } from "motion/react"

export default function ScrollLinked() {
    const { scrollYProgress } = useScroll()
    const scaleX = useSpring(scrollYProgress, {
        stiffness: 100,
        damping: 30,
        restDelta: 0.001,
    })

    return (
        <>
            <motion.div
                id="scroll-indicator"
                style={{
                    scaleX,
                    position: "fixed",
                    top: 0,
                    left: 0,
                    right: 0,
                    height: 10,
                    originX: 0,
                    backgroundColor: "var(--hue-1)",
                }}
            />
            <Content />
        </>
    )
}

/**
 * ==============   Utils   ================
 */

function Content() {
    return (
        <>
            <article style={{ maxWidth: 500, padding: "150px 20px" }}>
              {/*long body of p and h2 tags*/}
            </article>
        </>
    )
}
```

*Live example:* https://examples.motion.dev/react/scroll-linked-with-spring?utm_source=embed

> Since scrollY is a MotionValue, there's a neat trick you can use to tell when the user's scroll direction changes: const { scrollY } = useScroll() const [scrollDirection, setScrollDirection] = useState("down") useMotionValueEvent(scrollY, "change", (current) => { const diff = current - scrollY.getPrevious() setScrollDirection(diff > 0 ? "down" : "up") }) Perfect for triggering a sticky header animation! ~ Sam Selikoff, Motion for React Recipes

### Element scroll

To track the scroll position of a scrollable element we can pass the element's `ref` to `useScroll`'s `container` option:

```tsx
const carouselRef = useRef(null)
const { scrollX } = useScroll({
  container: carouselRef
})

return (
  <div ref={carouselRef} style={{ overflow: "scroll" }}>
    {children}
  </div>
)
```

```tsx
"use client"

import {
    animate,
    motion,
    MotionValue,
    useMotionValue,
    useMotionValueEvent,
    useScroll,
} from "motion/react"
import { useRef } from "react"

export default function ScrollLinked() {
    const ref = useRef(null)
    const { scrollXProgress } = useScroll({ container: ref })
    const maskImage = useScrollOverflowMask(scrollXProgress)

    return (
        <div id="example">
            <svg id="progress" width="80" height="80" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="30" pathLength="1" className="bg" />
                <motion.circle
                    cx="50"
                    cy="50"
                    r="30"
                    className="indicator"
                    style={{ pathLength: scrollXProgress }}
                />
            </svg>
            <motion.ul ref={ref} style={{ maskImage }}>
                <li style={{ background: "var(--hue-1)" }}></li>
                <li style={{ background: "var(--hue-2)" }}></li>
                <li style={{ background: "var(--hue-3)" }}></li>
                <li style={{ background: "var(--hue-4)" }}></li>
                <li style={{ background: "var(--hue-5)" }}></li>
                <li style={{ background: "var(--hue-6)" }}></li>
            </motion.ul>
            <StyleSheet />
        </div>
    )
}

const left = `0%`
const right = `100%`
const leftInset = `20%`
const rightInset = `80%`
const transparent = `#0000`
const opaque = `#000`
function useScrollOverflowMask(scrollXProgress: MotionValue<number>) {
    const maskImage = useMotionValue(
        `linear-gradient(90deg, ${opaque}, ${opaque} ${left}, ${opaque} ${rightInset}, ${transparent})`
    )

    useMotionValueEvent(scrollXProgress, "change", (value) => {
        if (value === 0) {
            animate(
                maskImage,
                `linear-gradient(90deg, ${opaque}, ${opaque} ${left}, ${opaque} ${rightInset}, ${transparent})`
            )
        } else if (value === 1) {
            animate(
                maskImage,
                `linear-gradient(90deg, ${transparent}, ${opaque} ${leftInset}, ${opaque} ${right}, ${opaque})`
            )
        } else if (
            scrollXProgress.getPrevious() === 0 ||
            scrollXProgress.getPrevious() === 1
        ) {
            animate(
                maskImage,
                `linear-gradient(90deg, ${transparent}, ${opaque} ${leftInset}, ${opaque} ${rightInset}, ${transparent})`
            )
        }
    })

    return maskImage
}

/**
 * ==============   Styles   ================
 */

function StyleSheet() {
    return (
        <style>{`
            #example {
              width: 100vw;
              max-width: 400px;
              position: relative;
            }

            #example #progress {
                position: absolute;
                top: -65px;
                left: -15px;
                transform: rotate(-90deg);
            }

            #example .bg {
                stroke: var(--layer);
            }

            #example #progress circle {
                stroke-dashoffset: 0;
                stroke-width: 10%;
                fill: none;
            }

            #progress .indicator {
                stroke: var(--accent);
            }

            #example ul {
                display: flex;
                list-style: none;
                height: 220px;
                overflow-x: scroll;
                padding: 20px 0;
                flex: 0 0 600px;
                margin: 0 auto;
                gap: 20px;
            }

            #example ::-webkit-scrollbar {
                height: 5px;
                width: 5px;
                background: #fff3;
                -webkit-border-radius: 1ex;
            }

            #example ::-webkit-scrollbar-thumb {
                background: var(--accent);
                -webkit-border-radius: 1ex;
            }

            #example ::-webkit-scrollbar-corner {
                background: #fff3;
            }

            #example li {
                flex: 0 0 200px;
                background: var(--accent);
            }

    `}</style>
    )
}

```


*Live example:* https://examples.motion.dev/react/scroll-container?utm_source=embed

### Element position

We can track the progress of an element as it moves within a container by passing its `ref` to the `target` option.

```tsx
const ref = useRef(null)
const { scrollYProgress } = useScroll({
  target: ref,
  offset: ["start end", "end end"]
})

return <div ref={ref}>
```

In this example, each item has its own progress indicator.

```tsx
"use client"

import { motion, useScroll } from "motion/react"
import { useRef } from "react"

function Item() {
    const ref = useRef(null)
    const { scrollYProgress } = useScroll({
        target: ref,
        offset: ["end end", "start start"],
    })

    return (
        <section style={itemContainer}>
            <div ref={ref} style={item}>
                <figure style={progressIconContainer}>
                    <svg
                        style={progressIcon}
                        width="75"
                        height="75"
                        viewBox="0 0 100 100"
                    >
                        <circle
                            style={progressIconBg}
                            cx="50"
                            cy="50"
                            r="30"
                            pathLength="1"
                            className="bg"
                        />
                        <motion.circle
                            cx="50"
                            cy="50"
                            r="30"
                            pathLength="1"
                            style={{
                                ...progressIconIndicator,
                                pathLength: scrollYProgress,
                            }}
                        />
                    </svg>
                </figure>
            </div>
        </section>
    )
}

export default function TrackElementWithinViewport() {
    return (
        <>
            <Item />
            <Item />
            <Item />
            <Item />
            <Item />
            <Item />
            <Item />
            <Item />
            <Item />
            <Item />
            <Item />
            <Item />
        </>
    )
}

/**
 * ==============   Styles   ================
 */

const itemContainer: React.CSSProperties = {
    height: "100vh",
    maxHeight: "400px",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
}

const progressIconContainer: React.CSSProperties = {
    position: "sticky",
    top: 0,
    width: 80,
    height: 80,
    margin: 0,
    padding: 0,
}

const processCircle: React.CSSProperties = {
    strokeDashoffset: 0,
    strokeWidth: 5,
    fill: "none",
}

const progressIcon: React.CSSProperties = {
    ...processCircle,
    transform: "translateX(-100px) rotate(-90deg)",
    stroke: "var(--hue-1)",
}

const progressIconIndicator: React.CSSProperties = {
    ...processCircle,
    strokeDashoffset: 0,
    strokeWidth: 5,
    fill: "none",
}

const progressIconBg: React.CSSProperties = {
    opacity: 0.2,
}

const item: React.CSSProperties = {
    width: 200,
    height: 250,
    border: "2px dotted var(--hue-1)",
    position: "relative",
}

```

*Live example:* https://examples.motion.dev/react/scroll-track-element-in-viewport?utm_source=embed

### Scroll offsets

With [the](/docs/react-use-scroll#offset)`offset`[option](/docs/react-use-scroll#offset) we can define which parts of the element we want to track with the viewport, for instance track elements as they enter in from the bottom, leave at the top, or travel throughout the whole viewport.

## Performance

Browsers are capable of animating some values, like `opacity`, `transform`, `clipPath` and `filter`, entirely on the GPU. This improves scroll synchronisation and ensures animations remain smooth even when sites are performing heavy work.

`useScroll` is also capable of running animations via the GPU. By passing `scrollXProgress` or `scrollYProgress` either directly to an `opacity` style, or via `useTransform` to one of the above styles, it will create a hardware-accelerated animation.

```tsx
const { scrollYProgress } = useScroll()
const filter = useTransform(scrollYProgress, [0, 1], ["blur(10px)", "blur(0px)"])

return <motion.div style={{ opacity: scrollYProgress, filter }} />
```

## Options

`useScroll` accepts the following options.

### container

**Default**: Viewport

The scrollable container to track the scroll position of. By default, this is the browser viewport. By passing a ref to a scrollable element, that element can be used instead.

```tsx
const containerRef = useRef(null)
const { scrollYProgress } = useScroll({ container: containerRef })
```

### target

`useScroll` tracks the progress of the `target` within the `container`. By default, the `target` is the scrollable area of the `container`. It can additionally be set as another element, to track its progress within the `container`.

```tsx
const targetRef = useRef(null)
const { scrollYProgress } = useScroll({ target: targetRef })
```

`target` is tracked by the element's layout position, so any CSS `transform` applied to it (or its ancestors) is ignored when measuring progress.

### axis

**Default:**`"y"`

The tracked axis for the defined `offset`.

### offset

**Default:** `["start start", "end end"]`

`offset` describes intersections, points where the `target` and `container` meet.

For example, the intersection `"start end"` means when the **start of the target** on the tracked axis meets the **end of the container.**

So if the target is an element, the container is the window, and we're tracking the vertical axis then `"start end"` is where the **top of the element** meets **the bottom of the viewport**.

#### Accepted intersections

Both target and container points can be defined as:

- **Number:** A value where `0` represents the start of the axis and `1` represents the end. So to define the top of the target with the middle of the container you could define `"0 0.5"`. Values outside this range are permitted.
- **Names:** `"start"`, `"center"` and `"end"` can be used as clear shortcuts for `0`, `0.5` and `1` respectively.
- **Pixels:** Pixel values like `"100px"`, `"-50px"` will be defined as that number of pixels from the start of the target/container.
- **Percent:** Same as raw numbers but expressed as `"0%"` to `"100%"`.
- **Viewport:** `"vh"` and `"vw"` units are accepted.

```tsx
// Track an element as it enters from the bottom
const { scrollYProgress } = useScroll({
  target: targetRef,
  offset: ["start end", "end end"]
})

// Track an element as it moves out the top
const { scrollYProgress } = useScroll({
  target: targetRef,
  offset: ["start start", "end start"]
})
```

### trackContentSize

**Default:** `false`

When the size of a page or element's content changes, its scrollable area can change too. But, because browsers don't provide a callback for changes in content size, by default `useScroll()` will not update until the next `"scroll"` event.

`useScroll` can automatically track changes to content size by setting `trackContentSize` to `true`.

```ts
useScroll({ trackContentSize: true })
```
