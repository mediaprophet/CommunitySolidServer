const turtle = `
@prefix schema: <https://schema.org/> .

<http://localhost:3000/acme/profile/card#me> a schema:LocalBusiness ;
  schema:name "Acme Artisanal Cafe & Bakery" ;
  schema:url <http://localhost:3000/acme/> ;
  schema:description "Handcrafted coffee, organic tea, and freshly baked sourdough pastries." ;
  schema:telephone "+61 2 9999 8888" .

<http://localhost:3000/acme/catalogue/espresso> a schema:Product ;
  schema:name "Single Origin Espresso" ;
  schema:description "Ethically sourced organic double shot espresso." ;
  schema:offers [
    a schema:Offer ;
    schema:price "4.50" ;
    schema:priceCurrency "AUD"
  ] .

<http://localhost:3000/acme/catalogue/croissant> a schema:Product ;
  schema:name "Warm Almond Croissant" ;
  schema:description "Flaky french pastry filled with almond frangipane." ;
  schema:offers [
    a schema:Offer ;
    schema:price "6.50" ;
    schema:priceCurrency "AUD"
  ] .
`;

async function main() {
  console.log('Sending RDF state to Solid IPMS Website Renderer (POST /.databox/ipms/website/preview) ...');
  const res = await fetch('http://localhost:3000/.databox/ipms/website/preview', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer 12345678901234567890123456789012',
    },
    body: JSON.stringify({
      state: {
        contentType: 'text/turtle',
        turtle,
      },
    }),

  });

  const data = await res.json();
  if (!res.ok) {
    console.error('IPMS Render error:', data);
    process.exit(1);
  }

  console.log('\n======================================================');
  console.log('SOLID IPMS GENERATED HTML & JSON-LD WEBSITE');
  console.log('======================================================\n');
  console.log('JSON-LD Data Structure:');
  console.log(JSON.stringify(data.jsonLd, null, 2));
  console.log('\nHTML Output snippet:\n');
  console.log(data.html);

  console.log('\nPublishing Website to Pod (POST /.databox/ipms/website/publish) ...');
  const pubRes = await fetch('http://localhost:3000/.databox/ipms/website/publish', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer 12345678901234567890123456789012',
    },
    body: JSON.stringify({
      baseIri: 'http://localhost:3000/acme/',
      feed: { turtle },
    }),
  });

  const pubData = await pubRes.json();
  console.log('Published Website Result:');
  console.log(JSON.stringify(pubData, null, 2));
}

main().catch(console.error);
