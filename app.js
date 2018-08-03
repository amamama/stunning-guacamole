/**
 * Copyright 2017, Google, Inc.
 * Licensed under the Apache License, Version 2.0 (the 'License');
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *    http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an 'AS IS' BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

'use strict';

const goatbotsURI = 'https://www.goatbots.com/card/ajax_card?search_name=';

const Request = require('request');
const Cardlist = require('./cardlist');

const {Card, CardWithPrice, Decklist, Deck} = require('./views/deck');

async function fetchCardPrice(card) {
    const base = new Date();
    try {
        const body = await new Promise((res, rej) => Request.get(goatbotsURI + card.name.replace(/[ \/]/g, '-').replace(/[',]/g,''), (err, response, body) => err?rej(err):res(body)));
        const json = JSON.parse(body);
        const price = json[1].map((e) => e.reduce((acc, cur) => (new Date(cur[0])).getTime() <= base.getTime()?cur:acc)).map((dateAndPrice) => dateAndPrice[1]).reduce((acc, cur) => Math.min(acc, cur), Infinity);

        return new CardWithPrice(card.name, card.number, price, 'Unkwon');
    } catch(e) {
        return new CardWithPrice(card.name, card.number, 0, '', 'Not Available');
    }

}

async function calcCard(card, fetch = false) {
    if(/^(Plains|Island|Swamp|Mountain|Forest)$/i.test(card.name)) return new CardWithPrice(card.name, card.number, 0);
    if(fetch) return fetchCardPrice(card);
    const regexpCard = new RegExp('^\\s*' + card.name + '\\s*$', 'i');
    const priceCard = Cardlist.find((c) => regexpCard.test(c.name));
    if(!priceCard) return new CardWithPrice(card.name, card.number, 0, '', 'Not Available');
    return new CardWithPrice(priceCard.name, card.number, parseFloat(priceCard.price), priceCard.foil, priceCard.set, priceCard.cmc, priceCard.type);
}

async function calcDecklist(decklist, fetch = false) {
    if(decklist.decklist.length == 0) return new Decklist([], []);
    return new Decklist(await Promise.all(decklist.main.map((c) => calcCard(c, fetch))), await Promise.all(decklist.sideboard.map((c) => calcCard(c, fetch))));
}

async function calcDeck(deck, fetch = false) {
    return new Deck(deck.name, await calcDecklist(deck.decklist, fetch));
}

// ds: [str]
// return: [{decklist: {main: [{price_sum: float, price: float, foil: bool, set: str, name:str, number: int}], sideboard: [~]}, name: str}]
async function calcDecks(ds, fetch = false) {
    const decks = (Array.isArray(ds)?ds.map((str) => JSON.parse(str)):[JSON.parse(ds)]).map((json) => (new Deck()).convertFromJSON(json));
    //console.log(decks);
    return await Promise.all(decks.map((d) => calcDeck(d, fetch)));
}

const Koa = require('koa');
const Router = require('koa-router');
const Send = require('koa-send');
const Body = require('koa-body');

const app = new Koa();
const router = new Router();

router
    .get('/', async (ctx, next) => Send(ctx, '/views' + '/index.html'))
    .get('/calc_cache', async (ctx, next) => ctx.body = await calcDecklist(new Decklist(decodeURIComponent(ctx.request.query.decklist))))
    .post('/calc_cache', Body({multipart: true}), async (ctx, next) => ctx.body = ctx.request.body.decks?await calcDecks(ctx.request.body.decks):[])
    .get('/calc', async (ctx, next) => ctx.body = await calcDecklist(new Decklist(decodeURIComponent(ctx.request.query.decklist)), true))
    .post('/calc', Body({multipart: true}), async (ctx, next) => ctx.body = ctx.request.body.decks?await calcDecks(ctx.request.body.decks, true):[])
    .get('/:str', async (ctx, next) => Send(ctx, '/views' + '/' + ctx.params.str))
;

app
    .use(router.routes())
;

app.listen(process.env.PORT || 8080);
