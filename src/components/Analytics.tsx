import Script from 'next/script'

// Google Analytics 4 and the Meta pixel load only when their IDs are set.
// With no IDs (the default) no tracking script is added to any page.
// IDs are checked to a strict format because they are placed inside a script.

const GA_ID = /^G-[A-Z0-9]{4,20}$/
const PIXEL_ID = /^\d{6,20}$/

export function Analytics() {
  const ga = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID ?? ''
  const pixel = process.env.NEXT_PUBLIC_META_PIXEL_ID ?? ''
  return (
    <>
      {GA_ID.test(ga) && (
        <>
          <Script src={`https://www.googletagmanager.com/gtag/js?id=${ga}`} strategy="afterInteractive" />
          <Script id="ga4" strategy="afterInteractive">
            {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());gtag('config','${ga}');`}
          </Script>
        </>
      )}
      {PIXEL_ID.test(pixel) && (
        <Script id="meta-pixel" strategy="afterInteractive">
          {`!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${pixel}');fbq('track','PageView');`}
        </Script>
      )}
    </>
  )
}
