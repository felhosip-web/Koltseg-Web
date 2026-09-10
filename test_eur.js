import fetch from 'node-fetch';

async function test() {
    try {
        const response = await fetch('https://open.er-api.com/v6/latest/EUR');
        const data = await response.json();
        console.log(data?.rates?.HUF);
    } catch (e) {
        console.error(e);
    }
}
test();
