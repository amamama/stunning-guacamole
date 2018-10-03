'use strict';
require('@google-cloud/debug-agent').start({
	allowExpressions: true
});

const goatbotsURI = 'https://www.goatbots.com';
const goatbotsSearchURI = goatbotsURI + '/card/ajax_card?search_name=';

const scryfallURI = 'https://api.scryfall.com';
const scryfallSearchURI = scryfallURI + '/cards/named?exact=';

const Datastore = require('@google-cloud/datastore');
const datastore = new Datastore();

const RequestPromise = require('request-promise');

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

	await (new Promise((res, rej) => setTimeout(() => res(), Math.random() * 1000 * 6)));

	const goatbotsPromise = RequestPromise(goatbotsSearchURI + cardName);
	const scryfallPromise = RequestPromise(scryfallSearchURI + cardName);
	const data = {date: (new Date()).toISOString(), goatbotsBody: await goatbotsPromise, scryfallBody: await scryfallPromise};

	datastore.save({key: key, excludeFromIndexes: ['goatbotsBody', 'scryfallBody'], data: data});
	return data;
}

function toCardFaces(scryfallObj) {
	return [];
}

async function calcCardData(card, date = new Date()) {
	if (/^(Plains|Island|Swamp|Mountain|Forest)$/i.test(card.name)) return new CardWithPrice(card.name, card.number, 0, []);
	try {
		const data = await fetchCardData(card, date);
		const goatbotsObj = JSON.parse(data.goatbotsBody);
		const price = goatbotsObj[1].map((e) => e.reduce((acc, cur) => (new Date(cur[0])).getTime() <= date.getTime() ? cur : acc), [new Date(), Infinity]).map((dateAndPrice) => dateAndPrice[1]).reduce((acc, cur) => Math.min(acc, cur), Infinity);

		const scryfallObj = JSON.parse(data.scryfallBody);
		card.mtgoID = card.mtgoID || scryfallObj.mtgo_id;

		return new CardWithPrice(card, price, toCardFaces(scryfallObj));
	} catch (e) {
		console.log(e.message, e.url, e.statusCode);
		return new CardWithPrice(card, 0, []);
	}
}

async function calcDecklist(decklist, date = new Date()) {
	if (!decklist.main || (decklist.main.length == 0 && decklist.sideboard.length == 0) || (decklist.decklist && decklist.decklist.length == 0)) return new Decklist([], []);
	return new Decklist(await Promise.all(decklist.main.map((c) => calcCardData(c, date))), await Promise.all(decklist.sideboard.map((c) => calcCardData(c, date))));
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
	.get('/calc', Kcors(), async (ctx, next) => ctx.body = await calcDecklist(Decklist.parseDecklist(decodeURIComponent(ctx.query.decklist)), (!ctx.query.date || ctx.query.date == '') ? new Date() : new Date(ctx.query.date)))
	.get('/:str', async(ctx, next) => Send(ctx, '/views' + '/' + ctx.params.str));

koa
	.use(router.routes())
	.use(router.allowedMethods())

	.listen(process.env.PORT || 8080);
