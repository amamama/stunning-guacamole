'use strict';
require('@google-cloud/debug-agent').start({
	allowExpressions: true
});

const goatbotsURI = 'https://www.goatbots.com';
const goatbotsSearchURI = goatbotsURI + '/card/ajax_card' //?search_name=';

const scryfallURI = 'https://api.scryfall.com';
const scryfallSearchURI = scryfallURI + '/cards/named' //?exact=';

const Datastore = require('@google-cloud/datastore');
const datastore = new Datastore();

const Axios = require('axios');

const {
	CardFace,
	Card,
	CardWithPrice,
	Decklist,
	Deck
} = require('./views/deck');

function normalizeCardName(name) {
	return name.toLowerCase().replace(/[ \/]+/g, '-').replace(/['",:;!.]/g, '');
}

async function fetchCardData(card, base) {
	const cardName = normalizeCardName(card.name);
	const key = datastore.key(['card', cardName]);
	const cachedData = await datastore.get(key).then((d) => d[0]).catch((e) => null);

	if(cachedData && base.getTime() < (new Date(cachedData.date)).getTime() + 24 * 60 * 60 * 1000) return cachedData;

	await (new Promise((res, rej) => setTimeout(() => res(), Math.random() * 1000 * 5)));

	const goatbotsPromise = Axios.get(goatbotsSearchURI, {params: {search_name: cardName}}).then((r) => r.data);
	const scryfallPromise = Axios.get(scryfallSearchURI, {params: {exact: cardName}}).then((r) => r.data);
	const data = {date: (new Date()).toISOString(), goatbotsBody: JSON.stringify(await goatbotsPromise), scryfallBody: JSON.stringify(await scryfallPromise)};

	datastore.save({key: key, excludeFromIndexes: ['goatbotsBody', 'scryfallBody'], data: data});
	return data;
}

function toCardFaces(scryfallObj) {
	return [scryfallObj.image_uris && scryfallObj.image_uris.small || scryfallObj.card_faces[0].image_uris.small];
}

async function calcCardData(card, date = new Date()) {
	try {
		const data = await fetchCardData(card, date);
		const goatbotsObj = JSON.parse(data.goatbotsBody);
		const price = /^(Plains|Island|Swamp|Mountain|Forest)$/i.test(card.name)?0:goatbotsObj[1].map((e) => e.reduce((acc, cur) => (new Date(cur[0])).getTime() <= date.getTime() ? cur : acc), [new Date(), Infinity]).map((dateAndPrice) => dateAndPrice[1]).reduce((acc, cur) => Math.min(acc, cur), Infinity);

		const scryfallObj = JSON.parse(data.scryfallBody);
		card.mtgoID = card.mtgoID || scryfallObj.mtgo_id;

		return new CardWithPrice(card, price, toCardFaces(scryfallObj));
	} catch (e) {
		console.log(e.response.data);
		console.log(e.response.status);      // 例：400
		console.log(e.response.statusText);  // Bad Request
		console.log(e.response.headers);
		console.log(e.message);
		return new CardWithPrice(card, -1, []);
	}
}

async function calcDecklist(decklist, date = new Date()) {
	if (!decklist.main || (decklist.main.length == 0 && decklist.sideboard.length == 0) || (decklist.decklist && decklist.decklist.length == 0)) return new Decklist([], []);
	return new Decklist(await Promise.all(decklist.main.map((c) => calcCardData(c, date))), await Promise.all(decklist.sideboard.map((c) => calcCardData(c, date))));
}

const Cheerio = require('cheerio');

async function previewDecklist(decklist, date = new Date(), name = 'Deck') {
	const readableDate = `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
	const previewPage = Cheerio.load(
`
<!DOCTYPE html>
<html>
    <head>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>${name} ${readableDate}</title>
        <style>
.grid-wrapper {
    display: grid;
    grid-template-columns: 2fr 1fr
}
.card {
    display: inline-block;
    position: relative;
}

.number, .price {
    position: absolute;
    right: 10%;
    background: rgba(20%, 20%, 20%, 80%);
    color: rgba(80%, 80%, 80%, 100%);
}
.number {
    top: 10%;
    font-size: 200%;
}

.price {
    bottom: 10%;
    text-align: right;
}
    </style>
    </head>
    <body>
        <div class='grid-wrapper'>
            <main>
            </main>
            <aside>
            </aside>
        </div>
    </body>
</html>
`
	);
	const dl = await calcDecklist(decklist, date);
	const mainPrice = dl.main.map((c) => c.sumPrice).reduce((acc, cur) => acc + cur, 0);
	const sidePrice = dl.sideboard.map((c) => c.sumPrice).reduce((acc, cur) => acc + cur, 0);
	const totalPrice = mainPrice + sidePrice;

	previewPage('body').prepend(`<h1>${name} toal ${totalPrice.toFixed(3)} tix (${readableDate})</h1>`)

	for(const card of dl.main) {
		previewPage('main').append(`<div class='card'><img src='${card.cardFaces[0]}'><span class='number'>x${card.number}</span><span class='price'>Price ${card.price.toFixed(3)}<br>Sum ${card.sumPrice.toFixed(3)}</span></div>`);
	}
	for(const card of dl.sideboard) {
		previewPage('aside').append(`<div class='card'><img src='${card.cardFaces[0]}'><span class='number'>x${card.number}</span><span class='price'>Price ${card.price.toFixed(3)}<br>Sum ${card.sumPrice.toFixed(3)}</span></div>`);
	}

	return previewPage.html();
}

const Koa = require('koa');
const Router = require('koa-router');
const Send = require('koa-send');
const Body = require('koa-body');
const Kcors = require('kcors');

const koa = new Koa();
const router = new Router();

router
	.get('/', async (ctx, next) => Send(ctx, '/views' + '/index.html'))
	.options('/calc', Kcors())
	.get('/calc', Kcors(), async (ctx, next) => ctx.body = await calcDecklist(Decklist.parseDecklist(decodeURIComponent(ctx.query.decklist || '')), ctx.query.date ? new Date(ctx.query.date) : new Date()))
	.get('/preview', async (ctx, next) => ctx.body = await previewDecklist(Decklist.parseDecklist(decodeURIComponent(ctx.query.decklist || '')), ctx.query.date ? new Date(ctx.query.date) : new Date(), ctx.query.name || 'Deck'))
	.get('/:str', async(ctx, next) => Send(ctx, '/views' + '/' + ctx.params.str))
;

koa
	.use(router.routes())
	.use(router.allowedMethods())

	.listen(process.env.PORT || 8080)
;
