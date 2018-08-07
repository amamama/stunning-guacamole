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
require('@google-cloud/debug-agent').start({ allowExpressions: true });

const goatbotsURI = 'https://www.goatbots.com/card/ajax_card?search_name=';

const Request = require('request');
const Cardlist = require('./cardlist');
const cachedDate = new Date(2018, 6, 20); //month's  origin is 0

const {Card, CardWithPrice, Decklist, Deck, DeckWithDate} = require('./views/deck');

async function fetchCardPrice(card, base = new Date()) {
    //console.log(goatbotsURI + card.name.replace(/[ \/]/g, '-').replace(/[',]/g,''));
    try {
        await new Promise((res, rej) => setTimeout(() => res(), Math.random() * 1000));
        const body = await new Promise((res, rej) => Request.get(goatbotsURI + card.name.replace(/[ \/]/g, '-').replace(/[',]/g,''), (err, response, body) => err?rej(err):res(body)));
        const json = JSON.parse(body);
        const price = json[1].map((e) => e.reduce((acc, cur) => (new Date(cur[0])).getTime() <= base.getTime()?cur:acc)).map((dateAndPrice) => dateAndPrice[1]).reduce((acc, cur) => Math.min(acc, cur), Infinity);

        return new CardWithPrice(card.name, card.number, price, 'Unknown');
    } catch(e) {
        console.log(e);
        return new CardWithPrice(card.name, card.number, 0, '', 'Not Available');
    }
}

async function calcCard(card, fetch = false, date = new Date()) {
    if(/^(Plains|Island|Swamp|Mountain|Forest)$/i.test(card.name)) return new CardWithPrice(card.name, card.number, 0);
    if(fetch) return fetchCardPrice(card, date);
    const regexpCard = new RegExp('^\\s*' + card.name + '\\s*$', 'i');
    const priceCard = Cardlist.find((c) => regexpCard.test(c.name));
    if(!priceCard) return new CardWithPrice(card.name, card.number, 0, '', 'Not Available');
    return new CardWithPrice(priceCard.name, card.number, parseFloat(priceCard.price), priceCard.foil, priceCard.set, priceCard.cmc, priceCard.type);
}

async function calcDecklist(decklist, fetch = false, date = new Date()) {
    if(!decklist.main || (decklist.main.length == 0 && decklist.sideboard.length == 0) || (decklist.decklist && decklist.decklist.length == 0)) return new Decklist([], []);
    return new Decklist(await Promise.all(decklist.main.map((c) => calcCard(c, fetch, date))), await Promise.all(decklist.sideboard.map((c) => calcCard(c, fetch, date))));
}

async function calcDeck(deck, fetch = false, date = new Date()) {
    return new DeckWithDate(deck.name, await calcDecklist(deck.decklist, fetch, date), fetch?date:cachedDate);
}

const Koa = require('koa');
const Router = require('koa-router');
const Send = require('koa-send');
const Body = require('koa-body');

const app = new Koa();
const router = new Router();

router
    .get('/', async (ctx, next) => Send(ctx, '/views' + '/index.html'))
    .get('/calc', async (ctx, next) => ctx.body = await calcDecklist(new Decklist(decodeURIComponent(ctx.request.query.decklist)), (ctx.request.query.fetch && ctx.request.query.fetch == 'true'), (!ctx.request.query.date || ctx.request.query.date == '')?new Date():new Date(ctx.request.query.date)))
    .get('/:str', async (ctx, next) => Send(ctx, '/views' + '/' + ctx.params.str))
;

app
    .use(router.routes())
;

app.listen(process.env.PORT || 8080);
