const HOSP_TURTLE = `
@prefix schema: <https://schema.org/> .

<http://localhost:3000/gourmet/profile/card#me> a schema:LocalBusiness ;
  schema:name "Aura Artisanal Bistro & Bar" ;
  schema:url <http://localhost:3000/gourmet/> ;
  schema:description "Handcrafted woodfired cuisine, natural wines, and organic sourdough pastries." ;
  schema:telephone "+61 2 9888 7777" .

<http://localhost:3000/gourmet/catalogue/truffle-pasta> a schema:Product ;
  schema:name "Handmade Black Truffle Tagliatelle" ;
  schema:description "Fresh egg pasta, cultured butter, shaved Manjimup black truffle." ;
  schema:offers [ a schema:Offer ; schema:price "38.00" ; schema:priceCurrency "AUD" ] .

<http://localhost:3000/gourmet/catalogue/wagyu> a schema:Product ;
  schema:name "Mayura Station Wagyu Ribeye (300g)" ;
  schema:description "MBS 9+ Wagyu ribeye, smoked bone marrow butter, charred leek." ;
  schema:offers [ a schema:Offer ; schema:price "72.00" ; schema:priceCurrency "AUD" ] .
`;

async function main() {
  console.log('Publishing 3 Business Verticals with Solid IPMS Theme Presets & Three.js 3D WebGL Canvas ...\n');

  // 1. Hospitality (Gourmet Artisanal Dark Gold)
  const hospRes = await fetch('http://localhost:3000/.databox/ipms/website/publish', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer 12345678901234567890123456789012',
    },
    body: JSON.stringify({
      baseIri: 'http://localhost:3000/gourmet/',
      feed: { turtle: HOSP_TURTLE },
    }),
  });

  const hospData = await hospRes.json();
  console.log('1. Hospitality (Gourmet Artisanal) Published:');
  console.log(JSON.stringify(hospData, null, 2));

  // 2. Tech Enterprise (Cybertech Neon Cyan)
  const techTurtle = `
@prefix schema: <https://schema.org/> .

<http://localhost:3000/cybertech/profile/card#me> a schema:LocalBusiness ;
  schema:name "Aether Quantum Systems" ;
  schema:url <http://localhost:3000/cybertech/> ;
  schema:description "Decentralised confidential computing, zero-knowledge proofs, and autonomous AI sidecars." ;
  schema:telephone "+1 800 555 0199" .

<http://localhost:3000/cybertech/catalogue/edge-node> a schema:Product ;
  schema:name "Quantum Edge Compute Node X1" ;
  schema:description "Hardened HSM sidecar with local WebID authentication and zero-knowledge enclave." ;
  schema:offers [ a schema:Offer ; schema:price "1250.00" ; schema:priceCurrency "USD" ] .
`;

  const techRes = await fetch('http://localhost:3000/.databox/ipms/website/publish', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer 12345678901234567890123456789012',
    },
    body: JSON.stringify({
      baseIri: 'http://localhost:3000/cybertech/',
      feed: { turtle: techTurtle },
    }),
  });

  const techData = await techRes.json();
  console.log('\n2. Tech Enterprise (Cybertech Neon) Published:');
  console.log(JSON.stringify(techData, null, 2));
}

main().catch(console.error);
