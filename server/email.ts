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

export async function sendVerificationEmail(email: string, code: string): Promise<boolean> {
  try {
    console.log(`Sending verification email to: ${email}`);
    const { client, fromEmail } = await getResendClient();
    console.log(`Using from email: ${fromEmail}`);
    
    const senderEmail = 'SwipeMe <noreply@swipeme.org>';
    
    console.log(`Sending from: ${senderEmail}`);
    
    const result = await client.emails.send({
      from: senderEmail,
      to: email,
      subject: 'Confirm your email address',
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 500px; margin: 0 auto; padding: 40px 20px; background-color: #ffffff;">
          <h1 style="color: #000000; font-size: 23px; font-weight: 700; margin: 0 0 24px 0; line-height: 1.3;">
            Confirm your email address
          </h1>
          
          <p style="color: #536471; font-size: 15px; line-height: 1.5; margin: 0 0 24px 0;">
            There's one quick step you need to complete before creating your SwipeMe account. Let's make sure this is the right email address for you — please confirm this is the right address to use for your new account.
          </p>
          
          <p style="color: #536471; font-size: 15px; line-height: 1.5; margin: 0 0 16px 0;">
            Please enter this verification code to get started on SwipeMe:
          </p>
          
          <div style="background: #f7f9f9; border-radius: 4px; padding: 20px; text-align: center; margin: 0 0 24px 0;">
            <span style="font-size: 32px; font-weight: 700; letter-spacing: 4px; color: #0f1419;">
              ${code}
            </span>
          </div>
          
          <p style="color: #536471; font-size: 15px; line-height: 1.5; margin: 0 0 24px 0;">
            Verification codes expire after 10 minutes.
          </p>
          
          <p style="color: #536471; font-size: 15px; line-height: 1.5; margin: 0;">
            Thanks,<br>
            SwipeMe
          </p>
        </div>
      `
    });
    
    console.log('Resend API response:', JSON.stringify(result));
    
    if (result.error) {
      console.error('Resend error:', result.error);
      return false;
    }
    
    console.log('Email sent successfully with ID:', result.data?.id);
    return true;
  } catch (error) {
    console.error('Failed to send verification email:', error);
    return false;
  }
}
