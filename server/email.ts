import { Resend } from 'resend';

let connectionSettings: any;

async function getCredentials() {
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY 
    ? 'repl ' + process.env.REPL_IDENTITY 
    : process.env.WEB_REPL_RENEWAL 
    ? 'depl ' + process.env.WEB_REPL_RENEWAL 
    : null;

  if (!xReplitToken) {
    throw new Error('X_REPLIT_TOKEN not found for repl/depl');
  }

  connectionSettings = await fetch(
    'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=resend',
    {
      headers: {
        'Accept': 'application/json',
        'X_REPLIT_TOKEN': xReplitToken
      }
    }
  ).then(res => res.json()).then(data => data.items?.[0]);

  if (!connectionSettings || (!connectionSettings.settings.api_key)) {
    throw new Error('Resend not connected');
  }
  return {
    apiKey: connectionSettings.settings.api_key, 
    fromEmail: connectionSettings.settings.from_email
  };
}

export async function getResendClient() {
  const { apiKey, fromEmail } = await getCredentials();
  return {
    client: new Resend(apiKey),
    fromEmail
  };
}

export async function sendWaitlistWelcomeEmail(email: string): Promise<boolean> {
  try {
    const { client } = await getResendClient();
    const senderEmail = 'SwipeMe <noreply@swipeme.org>';
    
    const result = await client.emails.send({
      from: senderEmail,
      to: email,
      subject: 'Welcome to the SwipeMe Waitlist!',
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px; background-color: #ffffff;">
          <div style="text-align: center; margin-bottom: 32px;">
            <div style="width: 64px; height: 64px; background: linear-gradient(135deg, #0066FF 0%, #00C8FF 100%); border-radius: 16px; margin: 0 auto 16px; display: flex; align-items: center; justify-content: center;">
              <span style="color: white; font-size: 28px; font-weight: 800;">S</span>
            </div>
            <h1 style="color: #0F172A; font-size: 28px; font-weight: 800; margin: 0; letter-spacing: -0.5px;">
              Thank You for Joining!
            </h1>
          </div>
          
          <p style="color: #475569; font-size: 16px; line-height: 1.7; margin: 0 0 24px 0;">
            You're officially on the SwipeMe waitlist! We're thrilled to have you join us on this journey to revolutionize how people message and send money.
          </p>
          
          <div style="background: linear-gradient(135deg, #F8FAFC 0%, #E6F0FF 100%); border-radius: 16px; padding: 24px; margin: 0 0 24px 0;">
            <h2 style="color: #0F172A; font-size: 18px; font-weight: 700; margin: 0 0 16px 0;">
              What's coming with SwipeMe:
            </h2>
            <ul style="color: #475569; font-size: 15px; line-height: 1.8; margin: 0; padding-left: 20px;">
              <li>End-to-end encrypted messaging powered by XMTP</li>
              <li>Instant P2P payments with multi-stablecoin support</li>
              <li>TikTok-style Moments feed with creator tipping</li>
              <li>Self-custodial wallet - your keys, your crypto</li>
              <li>Mini-apps marketplace for extended functionality</li>
            </ul>
          </div>
          
          <p style="color: #475569; font-size: 16px; line-height: 1.7; margin: 0 0 24px 0;">
            We'll notify you as soon as SwipeMe is ready for you to experience. In the meantime, follow us on social media to stay updated on our progress.
          </p>
          
          <div style="text-align: center; margin: 32px 0;">
            <a href="https://x.com/swipemee_" style="display: inline-block; background: linear-gradient(135deg, #0066FF 0%, #00C8FF 100%); color: white; text-decoration: none; padding: 14px 28px; border-radius: 12px; font-weight: 600; font-size: 15px;">
              Follow @swipemee_
            </a>
          </div>
          
          <hr style="border: none; border-top: 1px solid #E2E8F0; margin: 32px 0;">
          
          <p style="color: #94A3B8; font-size: 14px; line-height: 1.6; margin: 0; text-align: center;">
            Instant money, straight from your chat.<br>
            SwipeMe - The Super App
          </p>
        </div>
      `
    });
    
    if (result.error) {
      console.error('Resend error sending waitlist welcome:', result.error);
      return false;
    }
    
    return true;
  } catch (error) {
    console.error('Failed to send waitlist welcome email:', error);
    return false;
  }
}

export async function sendVerificationEmail(email: string, code: string, type: string = "signup"): Promise<boolean> {
  try {
    const { client } = await getResendClient();
    const senderEmail = 'SwipeMe <noreply@swipeme.org>';
    
    const isPasswordReset = type === "password_reset";
    const subject = isPasswordReset ? 'Reset your password' : 'Confirm your email address';
    const heading = isPasswordReset ? 'Reset your password' : 'Confirm your email address';
    const description = isPasswordReset 
      ? 'We received a request to reset your SwipeMe password. Use the code below to reset your password.'
      : 'There\'s one quick step you need to complete before creating your SwipeMe account. Let\'s make sure this is the right email address for you — please confirm this is the right address to use for your new account.';
    const actionText = isPasswordReset 
      ? 'Please enter this code to reset your password:'
      : 'Please enter this verification code to get started on SwipeMe:';
    
    const result = await client.emails.send({
      from: senderEmail,
      to: email,
      subject,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 500px; margin: 0 auto; padding: 40px 20px; background-color: #ffffff;">
          <h1 style="color: #000000; font-size: 23px; font-weight: 700; margin: 0 0 24px 0; line-height: 1.3;">
            ${heading}
          </h1>
          
          <p style="color: #536471; font-size: 15px; line-height: 1.5; margin: 0 0 24px 0;">
            ${description}
          </p>
          
          <p style="color: #536471; font-size: 15px; line-height: 1.5; margin: 0 0 16px 0;">
            ${actionText}
          </p>
          
          <div style="background: #f7f9f9; border-radius: 4px; padding: 20px; text-align: center; margin: 0 0 24px 0;">
            <span style="font-size: 32px; font-weight: 700; letter-spacing: 4px; color: #0f1419;">
              ${code}
            </span>
          </div>
          
          <p style="color: #536471; font-size: 15px; line-height: 1.5; margin: 0 0 24px 0;">
            ${isPasswordReset ? 'If you didn\'t request this, you can safely ignore this email.' : ''} Verification codes expire after 10 minutes.
          </p>
          
          <p style="color: #536471; font-size: 15px; line-height: 1.5; margin: 0;">
            Thanks,<br>
            SwipeMe
          </p>
        </div>
      `
    });
    
    if (result.error) {
      console.error('Resend error:', result.error);
      return false;
    }
    
    return true;
  } catch (error) {
    console.error('Failed to send verification email:', error);
    return false;
  }
}
