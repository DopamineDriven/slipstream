# Convenient UI Helpers

### Add [Family Style Dialog Component](https://examples.motion.dev/react/family-dialog) for Api Key create, update, and delete events

```tsx
"use client"

import { CloseIcon } from "@/ui/icons/CloseIcon"
import { AnimatePresence, motion, MotionConfig } from "motion/react"
import { useEffect, useRef, useState } from "react"

export default function Modal() {
    const [isOpen, setIsOpen] = useState(false)

    return (
        <MotionConfig
            transition={{ type: "spring", visualDuration: 0.2, bounce: 0 }}
        >
            <motion.div
                layoutId="modal"
                id="modal-open"
                style={{ borderRadius: 30 }}
            >
                <motion.button
                    className="openButton"
                    onClick={() => setIsOpen(true)}
                    style={{ borderRadius: 50 }}
                    data-primary-action
                    layoutId="cta"
                    whileTap={{ scale: 0.95 }}
                >
                    <motion.span layoutId="cta-text">Receive</motion.span>
                </motion.button>
            </motion.div>
            <AnimatePresence>
                {isOpen ? <Dialog close={() => setIsOpen(false)} /> : null}
            </AnimatePresence>
            <StyleSheet />
        </MotionConfig>
    )
}

function Dialog({ close }: { close: () => void }) {
    const dialogRef = useRef<HTMLDialogElement>(null)
    const modalRef = useRef<HTMLDivElement>(null)

    /**
     * Use the dialog element's imperative API to open and close the dialog
     * when the component mounts and unmounts. This enables exit animations
     * and maintains the dialog's natural accessibility behavior.
     */
    useEffect(() => {
        if (!dialogRef.current) return
        dialogRef.current.showModal()

        return () => dialogRef.current?.close()
    }, [dialogRef])

    useClickOutside(modalRef, close)

    return (
        <>
            <motion.div
                className="overlay"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2, ease: "linear" }}
            ></motion.div>
            <dialog
                ref={dialogRef}
                open={false}
                /**
                 * The onCancel event is triggered when the user
                 * presses the Esc key. We prevent the default and
                 * close the dialog via the provided callback that
                 * first sets React state to false.
                 *
                 * AnimatePresence will take care of our exit animation
                 * before actually closing the dialog.
                 */
                onCancel={(event) => {
                    event.preventDefault()
                    close()
                }}
                /**
                 * However, if the Esc key is pressed twice, the
                 * close method will always fire, and it isn't cancellable.
                 * So we listen for this and make sure the React
                 * state is updated to false.
                 */
                onClose={close}
            >
                <motion.div
                    ref={modalRef}
                    className="modal"
                    layoutId="modal"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    style={{
                        borderRadius: 30,
                    }}
                >
                    <motion.div layout exit={{ y: 100 }}>
                        <h2 className="title h3">
                            <QuestionMarkIcon />
                            Confirm
                        </h2>
                        <p className="big">
                            Are you sure you want to receive a load of money?
                        </p>
                        <div className="controls">
                            <button
                                onClick={close}
                                className="cancel"
                                style={{ borderRadius: 50 }}
                            >
                                Cancel
                            </button>
                            <motion.button
                                layoutId="cta"
                                layoutDependency={false}
                                onClick={close}
                                className="save"
                                style={{ borderRadius: 50 }}
                            >
                                <motion.span layoutId="cta-text">
                                    Receive
                                </motion.span>
                            </motion.button>
                        </div>
                        <button
                            className="closeButton"
                            aria-label="Close"
                            onClick={close}
                        >
                            <CloseIcon />
                        </button>
                    </motion.div>
                </motion.div>
            </dialog>
        </>
    )
}

/**
 * ==============   Utils   ================
 */

function useClickOutside(
    ref: React.RefObject<HTMLElement | null>,
    close: VoidFunction
) {
    useEffect(() => {
        const handleClickOutside = (event: React.MouseEvent<Element>) => {
            if (ref.current && checkClickOutside(event, ref.current)) {
                close()
            }
        }

        document.addEventListener("click", handleClickOutside as any)

        return () => {
            document.removeEventListener("click", handleClickOutside as any)
        }
    }, [ref])
}

function checkClickOutside(
    event: React.MouseEvent<Element>,
    element: HTMLElement
) {
    const { top, left, width, height } = element.getBoundingClientRect()

    if (
        event.clientX < left ||
        event.clientX > left + width ||
        event.clientY < top ||
        event.clientY > top + height
    ) {
        return true
    }
}

/**
 * ==============   Types   ================
 */
interface Dialog {
    isOpen: boolean
    open: () => void
    close: () => void
    ref: React.RefObject<HTMLDialogElement | null>
}

/**
 * ==============   Icons   ================
 */
function QuestionMarkIcon() {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#8df0cc"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <circle cx="12" cy="12" r="10" />
            <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
            <path d="M12 17h.01" />
        </svg>
    )
}

/**
 * ==============   Styles   ================
 */
function StyleSheet() {
    return (
        <style>{`
        #sandbox {
            justify-content: flex-end;
            padding: 20px;
            overflow: hidden;
        }

        #sandbox button {
            -webkit-touch-callout: none;
            -webkit-user-select: none;
        }

        #sandbox button:focus-visible {
            outline-offset: 2px;
            outline: 2px solid #8df0cc;
        }

        #sandbox button span {
            display: inline-block;
        }

        #modal-open {
            width: 100%;
            max-width: 400px;
            display: flex;
            justify-content: center;
        }

        .openButton, .controls button {
            width: 100%;
            max-width: 300px;
            background-color: #8df0cc;
            color: #0f1115;
            font-size: 16px;
            padding: 10px 20px;
            border-radius: 10px;
        }

        .controls {
            padding-top: 20px;
            display: flex;
            justify-content: flex-end;
            gap: 10px;
        }

        .controls button.cancel {
            background-color: var(--divider);
            color: #f5f5f5;
        }

        dialog {
            background: none;
            border: none;
            padding: 0;
            margin: 0;
            display: flex;
            justify-content: center;
            align-items: flex-end;
            width: 100%;
            height: 100%;
            max-width: 100%;
            max-height: 100%;
            overflow: hidden;
        }

        .modal {
            border: 1px solid #1d2628;
            background-color: #0b1011;
            width: 100%;
            max-width: 400px;
            position: relative;
            bottom: 20px;
            overflow: clip;
            display: flex;
            align-items: flex-start;
        }

        .modal > div {
            padding: 20px;
            position: relative;
            height: fit-content;
            flex: 1;
        }

        .modal p {
            margin: 0;
        }

        dialog::backdrop {
            display: none;
        }

        .title {
            margin: 0 0 20px;
            display: flex;
            align-items: center;
            gap: 10px;
        }

        .closeButton {
            position: absolute;
            top: 20px;
            right: 20px;
        }

        .overlay {
            background: rgba(0, 0, 0, 0.5);
            position: fixed;
            inset: 0;
            z-index: 9999999;
            backdrop-filter: blur(3px);
        }
    `}</style>
    )
}
```

