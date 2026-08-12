// Declarações de tipos para imports de CSS (usadas pelo template no web).
declare module '*.css';
declare module '*.module.css';

// `qrcode` não traz tipos; usa-se só no web (toDataURL) para o código de
// comparência (Fatia E). O 6-dígitos é o mecanismo real — o QR é conveniência.
declare module 'qrcode';
