const { GoogleGenerativeAI } = require('@google/generative-ai');
const { getConfig, logEvent } = require('./storage');

/**
 * Framework definitions for high-converting marketing posts
 */
const FRAMEWORKS = {
  audit: {
    name: "Free Niche Website Audit (Highest Conversion)",
    description: "Offers upfront value with 3 specific observations from analyzing local websites in this niche, inviting owners to ask for a free 5-minute teardown video.",
    systemGoal: "Position as a friendly web strategist doing teardowns for local businesses, offering a free video audit without being salesy."
  },
  case_study: {
    name: "Conversion & Redesign Case Study",
    description: "Highlights a realistic before-and-after improvement (e.g. mobile loading speed, click-to-call conversions, cleaner booking flow).",
    systemGoal: "Demonstrate concrete ROI and lead increase from modern web architecture tailored to this trade."
  },
  value_tips: {
    name: "Actionable Niche Tips & Checklist",
    description: "Shares 3 common website mistakes that cost local business owners calls and quote requests, with simple fixes.",
    systemGoal: "Educate business owners, build massive goodwill and authority, leading to inbound DMs."
  },
  soft_pitch: {
    name: "Niche Portfolio Showcase & Launch Offer",
    description: "Presents a clean, high-performance website template built specifically for this trade, offering a discounted launch setup for 1-2 local businesses.",
    systemGoal: "Direct showcase of portfolio and modern design capabilities."
  }
};

/**
 * Generates tailored Facebook group post variations using Gemini AI
 */
async function generatePostContent({
  nicheName,
  industry,
  location,
  specificAngle,
  framework = 'audit',
  portfolioUrl,
  customInstructions = '',
  variationCount = 1
}) {
  const config = getConfig();
  const apiKey = config.geminiApiKey || process.env.GEMINI_API_KEY;
  const portfolio = portfolioUrl || config.portfolioUrl || 'https://myportfolio.dev';
  const targetService = config.targetService || 'High-Converting Custom Web Development & Fast Landing Pages';
  const selectedFramework = FRAMEWORKS[framework] || FRAMEWORKS.audit;

  // Fallback if no Gemini API Key is configured
  if (!apiKey) {
    logEvent('warn', 'Gemini API Key not set. Generating high-converting template fallback.');
    return generateFallbackTemplates({
      nicheName,
      industry,
      location,
      specificAngle,
      framework,
      portfolio,
      targetService,
      count: variationCount
    });
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    // Use gemini-1.5-flash or gemini-2.5-flash for super-fast and reliable copy generation
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

    const prompt = `
You are an expert direct-response copywriter and B2B client acquisition strategist specializing in landing web development clients in niche Facebook groups.

TASK:
Write ${variationCount} completely distinct, natural-sounding, high-converting Facebook group post(s) tailored specifically for:
- Target Niche: "${nicheName}"
- Industry: "${industry || nicheName}"
- Location/Region: "${location || 'Local / Regional'}"
- Specific Angle / Pain Points: "${specificAngle || 'Getting more qualified customer calls & online quote bookings'}"
- Core Web Service: "${targetService}"
- Portfolio Link to optionally include: "${portfolio}"
- Chosen Marketing Framework: "${selectedFramework.name}" - ${selectedFramework.systemGoal}
${customInstructions ? `- Extra instructions: ${customInstructions}` : ''}

CRITICAL RULES FOR FACEBOOK GROUP SUCCESS:
1. Anti-Spam & Ban Protection: DO NOT sound like a generic scammer or cheap Fiverr spammer (Never use: "Dear Sir", "Inbox me for cheap websites", "DM for prices", "Best website developer").
2. Sound like a knowledgeable peer or local digital specialist who understands the exact day-to-day headaches of this specific niche (e.g. emergency calls for HVAC, patient trust for dentists, storm leads for roofers).
3. Value-First Opening: Hook them in the first 2 lines with a strong relatable problem or insight.
4. Structure:
   - Strong hook (relatable question or observation)
   - 2-3 bullet points with high-value insights or takeaways
   - Clear, frictionless Call To Action (e.g. "Drop your website below or shoot me a DM and I'll send over a free 5-minute video teardown" or "Check out my portfolio here: ${portfolio}").
5. Format the output as a clean JSON array of strings, where each item is a complete post ready to publish. Include natural line breaks (\\n) and tasteful emojis (max 2-4 per post).

RETURN ONLY A VALID JSON ARRAY OF STRINGS:
[
  "Post content 1...",
  "Post content 2..."
]
`;

    const result = await model.generateContent(prompt);
    const responseText = result.response.text().trim();
    
    // Parse the JSON array from response
    let cleanJson = responseText;
    if (cleanJson.startsWith('```json')) {
      cleanJson = cleanJson.replace(/^```json/, '').replace(/```$/, '').trim();
    } else if (cleanJson.startsWith('```')) {
      cleanJson = cleanJson.replace(/^```/, '').replace(/```$/, '').trim();
    }

    try {
      const posts = JSON.parse(cleanJson);
      if (Array.isArray(posts) && posts.length > 0) {
        logEvent('success', `Generated ${posts.length} AI post variation(s) for "${nicheName}" using ${framework} framework.`);
        return posts;
      }
    } catch (parseError) {
      console.warn('Direct JSON parse failed, extracting raw text:', parseError);
      return [responseText];
    }
  } catch (error) {
    logEvent('error', `Gemini API generation error: ${error.message}`);
    // Return high quality fallback
    return generateFallbackTemplates({
      nicheName,
      industry,
      location,
      specificAngle,
      framework,
      portfolio,
      targetService,
      count: variationCount
    });
  }
}

/**
 * High-converting handcrafted fallback templates when API key is missing or rate limited
 */
function generateFallbackTemplates({
  nicheName,
  industry,
  location,
  specificAngle,
  framework,
  portfolio,
  count = 1
}) {
  const templates = {
    audit: [
      `Quick question for ${industry || nicheName} owners in ${location || 'the area'} 👇\n\nI was doing some research on local service websites this week and noticed that over 60% are losing potential emergency calls because:\n\n❌ The phone number isn't clickable on mobile screens\n❌ Pages take 6+ seconds to load on 4G cellular\n❌ No quick "Instant Estimate / Request Service" form above the fold\n\nI’m a web developer specializing in fast, high-converting sites for ${industry || 'local businesses'}.\n\nI have some free time this Thursday and Friday to do 3 FREE, 5-minute video audits reviewing your site speed, mobile layout, and booking flow.\n\nNo pitch or catch—just 3 actionable things you can fix immediately.\n\nDrop your website link below or send me a DM if you’d like me to review yours! 🚀\n\n(Portfolio for reference: ${portfolio})`,
      `Fellow ${industry || nicheName} pros 👋\n\nIf you are currently running Google/FB ads or relying on local SEO in ${location || 'your city'}, here's a quick 2-minute test:\n\nOpen your website on your phone right now. Can a customer reach you in 1 single tap without scrolling?\n\nIf not, you're likely losing 30-40% of the traffic you already paid for.\n\nI build custom, lightning-fast websites designed specifically to turn searchers into scheduled jobs.\n\nI'm offering a completely free 5-point website teardown for 3 business owners in this group this week.\n\nComment below or shoot me a message with your URL and I'll send your video report! 👍`
    ],
    case_study: [
      `Quick breakdown of how we fixed the lead flow for a local ${industry || nicheName} business 📈\n\nTheir previous site looked okay, but they were barely getting 2-3 quote requests a week from organic search.\n\nHere are the 3 changes we made:\n1️⃣ Added a sticky "Call Now" button that follows mobile users as they scroll.\n2️⃣ Reduced page load time from 4.8s down to 0.7s.\n3️⃣ Swapped a long 8-field form for a streamlined 3-step instant quote form.\n\nResult? Quote submissions jumped by 42% in the first 30 days.\n\nIf your current site isn't actively bringing in jobs every week, feel free to check out some of my recent work: ${portfolio}\n\nHappy to answer any questions about modern web setups in the comments! 🛠️`
    ],
    value_tips: [
      `3 simple website tweaks that help ${industry || nicheName} companies book more jobs in ${location || '2026'} 💡\n\n1. Showcase Real Local Work: Stock photos kill trust. A 30-second video or before/after photos of your actual team work wonders.\n2. Speed is King: Over 70% of people looking for emergency services bounce if a page takes more than 3 seconds.\n3. Direct Call-to-Action: Make sure your "Schedule Service" or "Call Now" button is front and center on mobile.\n\nI build high-performance websites for ${industry || 'service businesses'}. You can browse some live examples here: ${portfolio}\n\nWhat's the biggest headache you currently have with your online presence? Let's discuss!`
    ],
    soft_pitch: [
      `Hey everyone! 👋\n\nI just finished designing a brand new, lightning-fast website framework tailored specifically for ${industry || nicheName} businesses.\n\nIt features:\n✅ 1-Tap Mobile Calling & Emergency Request buttons\n✅ Instant Online Estimate & Booking Funnel\n✅ Clean, modern design that outshines local competitors\n✅ 95+ Google PageSpeed score\n\nI'm looking to work with 1-2 ${industry || 'business owners'} in ${location || 'the area'} to launch a fresh site at a special portfolio rate in exchange for a case study/testimonial.\n\nCheck out my recent client work here: ${portfolio}\n\nIf you’re interested in upgrading your website, drop a comment or send a DM and let's connect! 🤝`
    ]
  };

  const pool = templates[framework] || templates.audit;
  const results = [];
  for (let i = 0; i < count; i++) {
    results.push(pool[i % pool.length]);
  }
  return results;
}

module.exports = {
  FRAMEWORKS,
  generatePostContent,
  generateFallbackTemplates
};
