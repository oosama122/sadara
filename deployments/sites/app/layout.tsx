import type { Metadata } from 'next';
export const metadata: Metadata = {title:'كلية الصدارة للعلوم الطبية والتقنية',description:'برامج الكلية والقبول والتسجيل والتواصل.',icons:{icon:'/assets/logo.jpg'}};
export default function RootLayout({children}:Readonly<{children:React.ReactNode}>) { return <html lang="ar" dir="rtl"><body>{children}</body></html>; }
