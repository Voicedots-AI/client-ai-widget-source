# CMRTC AI Widget

## Website installation guide

Prepared for CMR Technical Campus  

## Overview

The CMRTC AI Widget adds an AI assistant to the CMRTC website. It provides
visitors with four specialist areas: About Us, Courses, Admissions and
Placements. The widget appears as a minimized button in the bottom-right corner
and expands when a visitor selects it.

Installation requires adding one HTML snippet to the website. CMRTC does not
need to place an API key or password in its website code.

## Installation

1. Open the website template, global footer or tag-management system that is loaded on every page.
2. Paste the complete code below immediately before the closing `</body>` tag.
3. Save or publish the change.
4. Clear the website or WordPress cache, if caching is enabled.
5. Open the website in a private/incognito browser window and follow the checks in the Verification section.

### Widget code

```html
<!-- CMR Technical Campus AI Team — Voicedots AI widget -->
<voicedots-ai config='{
  "title": "CMRTC AI Team",
  "brandName": "CMRTC AI",
  "pipeline": "gemini",
  "agentId": "voicedots_agent_cmrtc_fbe08f2d9d25",
  "minimized": true,
  "themeColor": "#173B73",
  "logo": "https://cdn.jsdelivr.net/gh/Voicedots-AI-Deployment/animations@main/voicedotslogo.svg",
  "pos": "right",
  "avatars": [
    {
      "name": "about",
      "role": "About Us",
      "avatar": "https://cdn.jsdelivr.net/gh/Voicedots-AI-Deployment/animations@main/sales.lottie"
    },
    {
      "name": "courses",
      "role": "Courses",
      "avatar": "https://cdn.jsdelivr.net/gh/Voicedots-AI-Deployment/animations@main/support.lottie"
    },
    {
      "name": "admission",
      "role": "Admissions",
      "avatar": "https://cdn.jsdelivr.net/gh/Voicedots-AI-Deployment/animations@main/ceo.lottie"
    },
    {
      "name": "placement",
      "role": "Placements",
      "avatar": "https://cdn.jsdelivr.net/gh/Voicedots-AI-Deployment/animations@main/loan.lottie"
    }
  ]
}'></voicedots-ai>
<script type="module"
  src="https://cdn.jsdelivr.net/gh/Voicedots-AI/client-ai-widget-source@main/builds/cmrtc/widget.js">
</script>
```

Important: copy the entire snippet without changing the agent ID, quotation
marks, element name or script address.

## WordPress installation

Use the theme's global footer area or a trusted header-and-footer code manager.
Add the snippet as HTML in the footer/body-end area and publish it site-wide.
Do not paste it into the visible text editor of an individual page. If the site
uses a cache or optimization plugin, clear its cache after publishing.

## Google Tag Manager installation

1. Create a new **Custom HTML** tag.
2. Paste the complete widget code into the tag.
3. Set the trigger to **All Pages**.
4. Preview the container and verify the widget.
5. Publish the container.

Only one copy of the tag should run on a page.

## Verification

After installation, confirm all of the following:

- A minimized CMRTC AI button appears in the bottom-right corner.
- Selecting the button opens the widget.
- About Us, Courses, Admissions and Placements are visible.
- The browser requests microphone permission when voice conversation is started for the first time.
- A test question receives a spoken response.
- The widget works on both desktop and mobile pages.

Suggested test questions:

- “Where is CMR Technical Campus located?”
- “What is the CMRTC counselling code?”
- “How many CSE seats are available?”
- “What is the latest published highest placement package?”

## Browser and network requirements

- The website must be served over HTTPS for microphone access.
- Visitors must allow microphone permission to use voice features.
- The browser/network must allow scripts, images and animation assets from `cdn.jsdelivr.net`.
- The browser/network must allow secure WebSocket connections to `voice.voicedots.io`.

If CMRTC uses a Content Security Policy, its website administrator may need to
allow these hosts in the relevant `script-src`, `connect-src`, `img-src` and
media directives. The exact policy change should be reviewed by the website
administrator because existing policies differ between websites.

## Troubleshooting

**The widget does not appear**

- Confirm the complete snippet is present in the final page source.
- Confirm it is inserted as HTML and not displayed as visible text.
- Clear all website, plugin and CDN caches.
- Check that the code was added to the global template or All Pages trigger.
- Remove any duplicate or older VoiceDots widget snippet.

**The widget opens but does not connect**

- Confirm the page is running on `https://cmrtc.ac.in` or
  `https://www.cmrtc.ac.in`.
- Confirm that the network allows `wss://voice.voicedots.io`.
- Send the browser console error and affected page address to VoiceDots support.

**Voice does not start**

- Allow microphone access in the browser.
- Confirm the page is served over HTTPS.
- Test in a supported release of Chrome, Edge, Safari or Firefox.
- Check whether an institutional firewall blocks microphone or WebSocket use.

**The widget appears twice**

The code has been installed in more than one location, such as both the theme
footer and Google Tag Manager. Keep one installation and remove the duplicate.

## Updating or removing the widget

VoiceDots can publish normal widget improvements without requiring CMRTC to
replace the installation code. To remove the widget, remove the complete
`<voicedots-ai>...</voicedots-ai>` element and its following `<script>` element,
then clear the website cache.

## Support information to provide

When requesting assistance, please send:

- The page URL where the issue occurs
- Device and browser name
- A screenshot or short screen recording
- Approximate time of the test
- Any browser-console error visible to the website administrator

Do not send passwords or website administrator credentials.
