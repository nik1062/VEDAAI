import dotenv from 'dotenv';
dotenv.config({ override: true });

const apiKey = process.env.OPENAI_API_KEY;

async function test() {
  const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
  const response = await fetch(url);
  const body = await response.json();
  
  if (body.models) {
    console.log('Total models:', body.models.length);
    body.models.forEach(m => {
        console.log(`- ${m.name} (Methods: ${m.supportedGenerationMethods.join(', ')})`);
    });
  } else {
    console.log('Error:', body);
  }
}

test();
