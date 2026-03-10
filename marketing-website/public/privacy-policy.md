# Privacy Policy

**Last Updated: March 10, 2026**

## Introduction

VidVision ("we," "our," or "the Service") is committed to protecting your privacy. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our Service.

**Please read this Privacy Policy carefully.** If you do not agree with the terms, please do not use the Service.

## Information We Collect

### 1. Information You Provide

#### Google Account Information
When you sign in with Google OAuth, we collect:
- Google User ID
- Email address
- Profile name
- Profile picture (optional)

#### API Keys
- **Gemini API Key**: Stored locally in your browser's localStorage only
- Never transmitted to our servers
- Never logged or persisted on our backend
- You control and can delete at any time via browser settings

### 2. Information We Automatically Collect

#### YouTube Channel Data
When you authorize YouTube access, we collect:
- Channel ID and name
- Video titles, descriptions, and metadata
- Video analytics (views, likes, comments, watch time)
- Upload dates and video IDs
- Thumbnail URLs

#### Usage Data
- Features you use within the Service
- Time spent on various sections
- Browser type and version
- Device information
- IP addresses (for security and rate limiting)

#### Session Data
- Authentication tokens (stored in secure HTTP-only cookies)
- Session identifiers
- Login timestamps

### 3. Information from Third-Party Services

#### Google APIs
We use Google APIs to access:
- YouTube Data API v3 for channel analytics
- Google OAuth 2.0 for authentication
- Google Gemini API (via your own API key)

All use of Google APIs complies with [Google API Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy).

## How We Use Your Information

We use collected information to:

1. **Provide the Service**
   - Authenticate your identity
   - Display your YouTube channel analytics
   - Generate content recommendations
   - Create video scripts and ideas
   - Analyze competitor channels

2. **Improve the Service**
   - Analyze usage patterns
   - Fix bugs and errors
   - Develop new features
   - Optimize performance

3. **Communicate with You**
   - Send service announcements
   - Respond to support requests
   - Notify of important changes

4. **Security and Compliance**
   - Prevent fraud and abuse
   - Enforce our Terms of Service
   - Comply with legal obligations
   - Protect user safety

## How We Store Your Information

### Database Storage (Supabase)
We store the following in our Supabase database:
- User profiles (Google User ID, email, name)
- YouTube channel snapshots and analytics
- Session data

**Security Measures:**
- Encrypted at rest and in transit (TLS 1.3)
- Row Level Security (RLS) policies enforced
- Regular automated backups
- Access restricted to authenticated users only

### Local Browser Storage
The following data is stored in your browser only:
- Gemini API keys (localStorage)
- User preferences and settings
- Temporary cache for performance

**You can clear this data at any time via browser settings.**

### Server-Side Temporary Storage
- Uploaded videos processed temporarily and deleted immediately after processing
- No permanent storage of video files

## Data Sharing and Disclosure

### We DO NOT:
- Sell your personal information
- Share your data with advertisers
- Use your data for marketing third-party products
- Share your API keys with anyone

### We MAY share data:
1. **With Your Consent**: When you explicitly authorize it
2. **Service Providers**: Trusted third parties who help operate the Service:
   - **Supabase**: Database and authentication hosting
   - **Cloudflare**: Hosting and CDN services
   - **Google**: OAuth authentication and YouTube API
3. **Legal Compliance**: When required by law or to protect rights and safety
4. **Business Transfers**: In case of merger, acquisition, or sale of assets (with notice)

### Third-Party Services

This Service uses:
- **Supabase** ([Privacy Policy](https://supabase.com/privacy))
- **Cloudflare Pages** ([Privacy Policy](https://www.cloudflare.com/privacypolicy/))
- **Google APIs** ([Privacy Policy](https://policies.google.com/privacy))

These services have their own privacy policies, and we encourage you to review them.

## Data Retention

- **Account Data**: Retained while your account is active
- **YouTube Analytics**: Retained for historical comparison unless you request deletion
- **Session Data**: Expires after 30 days of inactivity
- **Logs**: Retained for 90 days for security and debugging

## Your Data Rights

You have the right to:

### 1. Access Your Data
Request a copy of your personal data we store.

### 2. Correct Your Data
Update or correct inaccurate information.

### 3. Delete Your Data
Request deletion of your account and associated data.

### 4. Export Your Data
Download your YouTube analytics snapshots in JSON format.

### 5. Revoke Access
Disconnect YouTube and Google account access via:
- [Google Account Permissions](https://myaccount.google.com/permissions)
- Or through the Service's Settings panel

### 6. Object to Processing
Opt out of certain data processing activities.

To exercise these rights, use the Settings panel in the Service or contact us at support@janso.studio.

## Cookies and Tracking

### Essential Cookies
We use HTTP-only cookies for:
- User authentication (session management)
- Security (CSRF protection)
- Preferences

These cookies are necessary for the Service to function.

### Analytics
We may use privacy-friendly analytics (e.g., Cloudflare Web Analytics) that:
- Do not track individual users across sites
- Do not sell data to third parties
- Do not require cookie consent in most jurisdictions

You can disable analytics by using browser privacy settings or ad blockers.

## Google API Services User Data Policy

Our use of information received from Google APIs adheres to the [Google API Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy), including the **Limited Use requirements**.

### Limited Use Disclosure

VidVision's use and transfer to any other app of information received from Google APIs will adhere to Google's Limited Use requirements, meaning:

1. **Limited to Disclosed Uses**: We only use YouTube data to provide and improve features explicitly disclosed to you
2. **No Human Access**: No humans review your YouTube data except:
   - When you explicitly request support
   - For security purposes (detecting abuse)
   - When required by law
3. **No Transfer to Third Parties**: We do not transfer YouTube data to third parties except:
   - As necessary to provide the Service (e.g., Supabase for storage)
   - Aggregated, anonymized data for analytics
   - With your explicit consent

## International Data Transfers

Our Service is hosted on Cloudflare Pages, which uses a global CDN. Your data may be processed in countries outside your residence, including the United States and Europe.

We ensure appropriate safeguards are in place, including:
- Standard Contractual Clauses (SCCs)
- Data Processing Agreements with vendors
- Encryption in transit and at rest

## Children's Privacy

The Service is not intended for users under 13 (or 16 in the EU). We do not knowingly collect information from children. If we learn we have collected data from a child, we will delete it promptly.

If you believe a child has provided us with personal information, contact us immediately at [Your Contact Email].

## Security

We implement industry-standard security measures:
- **Encryption**: TLS 1.3 for data in transit, AES-256 for data at rest
- **Authentication**: Google OAuth 2.0 with secure tokens
- **Access Control**: Role-based access and Row Level Security
- **Monitoring**: Automated security scanning and alerts
- **Audits**: Regular security reviews

However, no method of transmission over the Internet is 100% secure. Use the Service at your own risk.

## Changes to This Privacy Policy

We may update this Privacy Policy from time to time. Changes will be posted on this page with an updated "Last Updated" date.

**Material changes** will be notified via:
- Email notification
- In-app notification
- Prominent notice on the Service

Continued use after changes constitutes acceptance of the updated Privacy Policy.

## California Privacy Rights (CCPA)

If you are a California resident, you have additional rights under the California Consumer Privacy Act (CCPA):

1. **Right to Know**: What personal information we collect and how we use it
2. **Right to Delete**: Request deletion of your personal information
3. **Right to Opt-Out**: Opt out of sale of personal information (we don't sell data)
4. **Right to Non-Discrimination**: Equal service regardless of privacy choices

To exercise these rights, contact us at [Your Contact Email].

## European Privacy Rights (GDPR)

If you are in the European Economic Area (EEA), UK, or Switzerland, you have rights under the General Data Protection Regulation (GDPR):

1. **Legal Basis for Processing**:
   - **Consent**: For YouTube data access
   - **Legitimate Interest**: For Service improvement and security
   - **Contract**: To provide the Service you requested

2. **Data Protection Officer**: [Your DPO Contact] (if applicable)

3. **Right to Lodge a Complaint**: You may file a complaint with your local data protection authority

## Data Breach Notification

In the event of a data breach that affects your personal information, we will:
- Notify you within 72 hours of discovery
- Inform you of what data was compromised
- Explain steps we're taking to address the breach
- Provide recommendations to protect yourself

## Contact Us

If you have questions or concerns about this Privacy Policy or our data practices:

- **Email**: [Your Contact Email]
- **Website**: https://janso.studio
- **Support**: Use the in-app feedback feature

For data protection inquiries from the EU:
- **Data Protection Officer**: [DPO Contact] (if applicable)

---

## Summary of Key Points

✅ **What we collect**: Google account info, YouTube analytics, usage data  
✅ **What we DON'T collect**: Your Gemini API keys (browser-only storage)  
✅ **What we DON'T do**: Sell data, share with advertisers, store videos permanently  
✅ **Your control**: Delete account, revoke access, export data anytime  
✅ **Security**: Industry-standard encryption and access controls  
✅ **Compliance**: GDPR, CCPA, Google API Services User Data Policy  

---

**By using VidVision, you acknowledge that you have read and understood this Privacy Policy and consent to the collection and use of your information as described.**
