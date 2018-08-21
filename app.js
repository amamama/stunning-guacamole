'use strict';
require('@google-cloud/debug-agent').start({
	allowExpressions: true
});

const goatbotsURI = 'https://www.goatbots.com';
const goatbotsSearchURI = goatbotsURI + '/card/ajax_card?search_name=';
const goatbots3dhURI = goatbotsURI + '/3dh';

const Fs = require('fs');

const Datastore = require('@google-cloud/datastore');
const datastore = new Datastore();

const CheerioHttpcli = require('cheerio-httpcli');

const key3dhDate = datastore.key(['3dh', 'date']);
//const cachedDate = datastore.get(key3dhDate).then((es) => new Date(es[0].date)).catch((e) => new Date(0));
const cachedDate = new Date(0);
const cardlist = new Promise((res, rej) => Fs.readFile('cardlist.json', (e, d) => {if(e) rej(e);res(JSON.parse(d))}));

const {
	Card,
	CardWithPrice,
	Decklist,
	Deck,
	DeckWithDate
} = require('./views/deck');

function normalizeCardName(name) {
	return name.toLowerCase().replace(/[ \/]a/g, '-').replace(/[',]/g, '');
}

async function fetch3dhTable(submitPromise) {
	//const {$, response, body} = await submitPromise;
	const {$, response, body} = await CheerioHttpcli.fetch('http://localhost:8000/3dh_july_2018.html');
	return $('tr').toArray().map((e) =>
		new CardWithPrice(
			$($('td', e)[0]).text(),
			1,
			parseFloat($($('td', e)[1]).text()),
			$($('td', e)[3]).text(),
			$($('td', e)[2]).text(),
			$($('td', e)[4]).text(),
			$($('td', e)[5]).text()
		)
	);
}

async function save3dhCardlist(cardlistPromise, date) {
	datastore.save({key: key3dhDate, data: {date: date.toJSON()}});
	Fs.writeFile('cardlist.json', (await cardlistPromise).convertToJSONString(), (e) => {if(e) throw e;});
}

async function update3dhTable(ctx, next) {
	if(ctx.get('X-Appengine-Cron') != 'true') {
		ctx.body = 'external access is not allowed';
		//return;
	}

	//const {$, response, body} = await CheerioHttpcli.fetch(goatbots3dhURI);
	//const form = $('form');
	const [str, mm, dd, yy] = //form.parent('#text_left').text()
	'Last revision: July 20th 2018\n'.match(/Last revision: ([^\n]*)\n/i)[1].replace(/Jan|Feb|Mar|Apr|May|June|July|Aug|Sept|Oct|Nov|Dec/, (m) => ({Jan:1, Feb: 2, Mar: 3, Apr: 4, May: 5, June: 6, July: 7, Aug: 8, Sept: 9, Oct: 10, Nov: 11, Dec: 12}[m]).toString()).replace(/th|st|nd|rd/, ' ').match(/(\d+) +(\d+) +(\d+)/);

	const newDate = new Date(yy, mm - 1, dd);

	if(newDate.getTime() <= (await cachedDate).getTime()) {
		ctx.body = 'latest';
		return;
	}

	try {
		//const newCardlistPromise = fetch3dhTable(form.submit());
		const newCardlistPromise = fetch3dhTable();
		save3dhCardlist(newCardlistPromise, newDate);
		ctx.body = 'update';
	} catch (e) {
		ctx.body = 'error occured';
	}
	return;
}

async function fetchCardPrice(card, base = new Date()) {
	//console.log(goatbotsURI + card.name.replace(/[ \/]/g, '-').replace(/[',]/g,''));
	try {
		await new Promise((res, rej) => setTimeout(() => res(), Math.random() * 1000));
		const {
			$,
			response,
			body
		} = await CheerioHttpcli.fetch(goatbotsSearchURI + normalizeCardName(card.name));
		const json = JSON.parse(body);
		const price = json[1].map((e) => e.reduce((acc, cur) => (new Date(cur[0])).getTime() <= base.getTime() ? cur : acc)).map((dateAndPrice) => dateAndPrice[1]).reduce((acc, cur) => Math.min(acc, cur), Infinity);

		return new CardWithPrice(card.name, card.number, price, 'Unknown');
	} catch (e) {
		console.log(e);
		return new CardWithPrice(card.name, card.number, 0, '', 'Not Available');
	}
}

async function calcCard(card, fetch = false, date = new Date()) {
	if (/^(Plains|Island|Swamp|Mountain|Forest)$/i.test(card.name)) return new CardWithPrice(card.name, card.number, 0);
	if (fetch) return fetchCardPrice(card, date);
	const cardObj = (await cardlist).find((c) => normalizeCardName(c.name) == normalizeCardName(card.name));
	if (!cardObj) return new CardWithPrice(card.name, card.number, 0, '', 'Not Available');
	return new CardWithPrice(cardObj.name, card.number, parseFloat(cardObj.price), cardObj.foil, cardObj.set, cardObj.cmc, cardObj.type);
}

async function calcDecklist(decklist, fetch = false, date = new Date()) {
	if (!decklist.main || (decklist.main.length == 0 && decklist.sideboard.length == 0) || (decklist.decklist && decklist.decklist.length == 0)) return new Decklist([], []);
	return new Decklist(await Promise.all(decklist.main.map((c) => calcCard(c, fetch, date))), await Promise.all(decklist.sideboard.map((c) => calcCard(c, fetch, date))));
}

const Koa = require('koa');
const Router = require('koa-router');
const Send = require('koa-send');
const Body = require('koa-body');

const koa = new Koa();
const router = new Router();

router
	.get('/', async (ctx, next) => Send(ctx, '/views' + '/index.html'))
	.get('/cardlist', async (ctx, next) => ctx.body = await cardlist)
	.get('/cachedDate', async (ctx, next) => ctx.body = await cachedDate)
	.get('/calc', async (ctx, next) => ctx.body = await calcDecklist(new Decklist(decodeURIComponent(ctx.query.decklist)), (ctx.query.fetch && ctx.query.fetch == 'true'), (!ctx.query.date || ctx.query.date == '') ? new Date() : new Date(ctx.query.date)))
	.get('/update3dhTable', async (ctx, next) => update3dhTable(ctx, next))
	.get('/:str', async(ctx, next) => Send(ctx, '/views' + '/' + ctx.params.str));

koa
	.use(router.routes());

koa.listen(process.env.PORT || 8080);
