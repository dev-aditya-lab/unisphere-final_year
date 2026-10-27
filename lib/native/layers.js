// An open sheet, dialog or menu. Radix marks every one of them like this and closes it on Escape, which is how the back button closes
// one (components/native/native-bridge.jsx) and how a pop-up knows to wait its turn (components/native/native-push.jsx).
export const OPEN_LAYER = '[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"], [role="menu"][data-state="open"]';
