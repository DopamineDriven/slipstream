"use client";

import { Toast } from "@base-ui/react/toast";
import { AnimatePresence, motion } from "motion/react";

export default function BaseToast() {
  return (
    <Toast.Provider timeout={3000}>
      <ToastButton />
      <Toast.Viewport className="toast-viewport">
        <ToastList />
      </Toast.Viewport>
      <StyleSheet />
    </Toast.Provider>
  );
}

function ToastButton() {
  const toastManager = Toast.useToastManager();

  return (
    <motion.button
      whileTap={{ scale: 0.9 }}
      className="button primary-action large"
      onClick={() => {
        toastManager.add({
          title: "Scheduled: Catch up",
          description: prettyDate(randomDate())
        });
      }}>
      Add to calendar
    </motion.button>
  );
}

function ToastList() {
  const toastManager = Toast.useToastManager();

  return (
    <AnimatePresence>
      {toastManager.toasts.map(toast => (
        <Toast.Root
          key={toast.id}
          toast={toast}
          render={
            <motion.div
              className="toast-root"
              initial={{ opacity: 0, x: 100 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, scale: 0.9 }}
              drag="x"
              dragElastic={0.1}
              dragConstraints={{ left: 0 }}
              onUpdate={latest => {
                latest.x;
                if (
                  latest?.x &&
                  (typeof latest.x === "string"
                    ? Number.parseFloat(latest.x)
                    : latest.x) > 100
                ) {
                  toastManager.close(toast.id);
                }
              }}>
              <Toast.Title className="toast-title" />
              <Toast.Description
                render={
                  <time
                    className="toast-description"
                    dateTime={
                      typeof toast.description === "string"
                        ? toast.description
                        : ""
                    }>
                    {toast.description}
                  </time>
                }
              />
              <Toast.Close
                className="toast-action"
                render={
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    className="button small">
                    Undo
                  </motion.button>
                }
              />
            </motion.div>
          }
        />
      ))}
    </AnimatePresence>
  );
}

function prettyDate(date: Date) {
  return date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

function randomDate() {
  const now = new Date();
  const futureTime = now.getTime() + Math.random() * 7 * 24 * 60 * 60 * 1000;
  return new Date(futureTime);
}

/**
 * ==============   Styles   ================
 */
function StyleSheet() {
  return (
    <style>{`
            .button {
                background: #8df0cc;
                color: #f5f5f5;
                border: none;
                padding: 12px 24px;
                border-radius: 6px;
                cursor: pointer;
                font-size: 16px;
                font-weight: 500;
            }

            .toast-viewport {
                position: fixed;
                bottom: 0;
                right: 0;
                display: flex;
                flex-direction: column;
                padding: 25px;
                gap: 10px;
                width: 390px;
                max-width: 100vw;
                margin: 0;
                list-style: none;
                z-index: 2147483647;
                outline: none;
            }

            .toast-root {
                background-color: #0b1011;
                border: 1px solid #1d2628;
                border-radius: 10px;
                box-shadow:
                    hsl(206 22% 7% / 35%) 0px 10px 38px -10px,
                    hsl(206 22% 7% / 20%) 0px 10px 20px -15px;
                padding: 15px;
                display: grid;
                grid-template-areas: "title action" "description action";
                grid-template-columns: auto max-content;
                column-gap: 15px;
                align-items: center;
            }

            .toast-title {
                grid-area: title;
                margin-bottom: 5px;
                font-weight: 500;
                color: var(--text);
                font-size: 15px;
            }

            .toast-description {
                grid-area: description;
                margin: 0;
                color: var(--feint-text);
                font-size: 13px;
                line-height: 1.3;
            }

            .toast-action {
                grid-area: action;
            }

            .button {
                display: inline-flex;
                align-items: center;
                justify-content: center;
                border-radius: 10px;
                font-weight: 500;
                user-select: none;
            }
            .button.small {
                font-size: 14px;
                padding: 0 10px;
                line-height: 25px;
                height: 25px;
                background: #8df0cc;
                color: #0f1115;
            }
            .button.large {
                font-size: 16px;
                padding: 0 10px;
                line-height: 35px;
                height: 35px;
            }
        `}</style>
  );
}
