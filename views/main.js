function addEventListenerPromise(target, type, listener) {
    return new Promise((res, rej) => target.addEventListener(type, (e) => res(listener(e))));
}

async function calcTextDecklist(str, doFetch) {
    return (new Decklist()).convertFromJSON(await fetch(`/calc${doFetch?'':'_cache'}?decklist=${encodeURIComponent(str)}`, {credentials: 'same-origin'}).then((r) => r.json()));
}

async function calcAllDecks(decks, doFetch) {
    const fd = new FormData();

    for(const deck of decks) fd.append('decks', deck.convertToJSON());

    let decks_json = await fetch(`/calc${doFetch?'':'_cache'}`, {method: 'POST', credentials: 'same-origin', body: fd}).then((r) => r.json());

    return decks_json.map((json) => (new Deck()).convertFromJSON(json));

}

document.addEventListener('DOMContentLoaded', load);

function load() {
    let decks = [];

    const dl_form = document.getElementById('decklist_form');
    const dl_text = dl_form.decklist_text;
    const dl_files = dl_form.decklist_files;

    const chkbox = document.getElementById('fetch');

    dl_text.value = localStorage.getItem('decklist_text') || '';

    dl_files.addEventListener('change', readDeckFromFile);

    async function readDeckFromFile() {
        decks = await Promise.all(Array.from(dl_files.files).map((file) => {
            const reader = new FileReader();
            let p = addEventListenerPromise(reader, 'load', async (e) => {
                updateTable(new Deck(file.name, await calcTextDecklist(reader.result, chkbox.checked)));
                return new Deck(file.name, new Decklist(reader.result));
            });
            reader.readAsText(file);
            return p;
        }));
    }


    const calc_button = document.getElementById('calc');
    calc_button.addEventListener('click', async (e) => {
        updateTable(new Deck('text', await calcTextDecklist(dl_text.value, chkbox.checked)));
        let decksWithPrice = await calcAllDecks(decks, chkbox.checked);
        decksWithPrice.map((d) => updateTable(d));

        localStorage.setItem('decklist_text', dl_text.value);
    });

    const reload_button = document.getElementById('reload');
    reload_button.addEventListener('click', readDeckFromFile);

}

function cardsToTable(cards) {
    const table = document.createElement('table');
    if(!cards) return table;
    table.createTHead();
    let headRow = table.tHead.insertRow();
    headRow.insertCell().appendChild(document.createTextNode('Num of cards'));
    headRow.insertCell().appendChild(document.createTextNode('Name'));
    headRow.insertCell().appendChild(document.createTextNode('Price'));
    headRow.insertCell().appendChild(document.createTextNode('Sum'));
    headRow.insertCell().appendChild(document.createTextNode('Set'));
    headRow.insertCell().appendChild(document.createTextNode('Foil'));

    for(let card of cards) {
        let row = table.insertRow();
        row.insertCell().appendChild(document.createTextNode(card.number));
        row.insertCell().appendChild(document.createTextNode(card.name));
        row.insertCell().appendChild(document.createTextNode(card.price));
        row.insertCell().appendChild(document.createTextNode(card.price_sum));
        row.insertCell().appendChild(document.createTextNode(card.set));
        row.insertCell().appendChild(document.createTextNode(card.foil?'*':''));
    }

    return table;
}

function decklistToTable(decklist) {
    const table = document.createElement('table');
    let row = table.insertRow();
    row.insertCell().appendChild(cardsToTable(decklist.main));
    row.insertCell().appendChild(cardsToTable(decklist.sideboard));

    let mainPrice = decklist.main.map((c) => c.price_sum).reduce((acc, cur) => acc + cur, 0);
    let sidePrice = decklist.sideboard.map((c) => c.price_sum).reduce((acc, cur) => acc + cur, 0);
    let headRow = table.tHead.insertRow();
    table.createTHead();
    headRow.insertCell().appendChild(document.createTextNode(`Mainboard ${mainPrice.toFixed(3)} tix`));
    headRow.insertCell().appendChild(document.createTextNode(`Sideboard ${sidePrice.toFixed(3)} tix`));
    return {decklistTable: table, mainPrice, sidePrice};
}

function deckToTable(deck) {
    const table = document.createElement('table');
    table.id = deck.name;

    const mainPrice = deck.decklist.main.map((c) => c.price_sum).reduce((acc, cur) => acc + cur, 0);
    const sidePrice = deck.decklist.sideboard.map((c) => c.price_sum).reduce((acc, cur) => acc + cur, 0);

    table.createTHead();

    const boardRow = table.tHead.insertRow();
    const mainCell = boardRow.insertCell();
    mainCell.colSpan = 6;
    mainCell.appendChild(document.createTextNode(`Mainboard ${mainPrice.toFixed(3)} Tix`));
    const sideCell = boardRow.insertCell();
    sideCell.colSpan = 6;
    sideCell.appendChild(document.createTextNode(`Sideboard ${sidePrice.toFixed(3)} Tix`));

    const cardDataRow = table.tHead.insertRow();
    for(let i = 0; i < 2; i++) {
        for(const h of ['Num', 'Name', 'Price', 'Sum', 'Foil', 'Set']) {
            cardDataRow.insertCell().appendChild(document.createTextNode(h));
        }
    }

    for(let i = 0; i < Math.max(deck.decklist.main.length, deck.decklist.sideboard.length); i++) {
        const row = table.insertRow();
        if(i < deck.decklist.main.length) {
            const card = deck.decklist.main[i];
            row.insertCell().appendChild(document.createTextNode(card.number));
            row.insertCell().appendChild(document.createTextNode(card.name));
            row.insertCell().appendChild(document.createTextNode(card.price.toFixed(3)));
            row.insertCell().appendChild(document.createTextNode(card.price_sum.toFixed(3)));
            row.insertCell().appendChild(document.createTextNode(card.foil));
            row.insertCell().appendChild(document.createTextNode(card.set));
        } else {
            for(let j = 0; j < 6; j++) {
                row.insertCell().appendChild(document.createTextNode(''));
            }
        }
        if(i < deck.decklist.sideboard.length) {
            const card = deck.decklist.sideboard[i];
            row.insertCell().appendChild(document.createTextNode(card.number));
            row.insertCell().appendChild(document.createTextNode(card.name));
            row.insertCell().appendChild(document.createTextNode(card.price.toFixed(3)));
            row.insertCell().appendChild(document.createTextNode(card.price_sum.toFixed(3)));
            row.insertCell().appendChild(document.createTextNode(card.foil));
            row.insertCell().appendChild(document.createTextNode(card.set));
        }
    }
/*
    table.createTHead();
    table.tHead.insertRow().insertCell().appendChild(document.createTextNode('Decklist'));

    const {decklistTable, mainPrice, sidePrice} = decklistToTable(deck.decklist);
    table.insertRow().insertCell().appendChild(decklistTable);

    const totalPrice = mainPrice + sidePrice;
    table.createCaption();
    table.caption.innerText = `${deck.name} total ${totalPrice.toFixed(3)} tix`;
*/

    const totalPrice = mainPrice + sidePrice;
    table.createCaption();
    table.caption.innerText = `${deck.name} total ${totalPrice.toFixed(3)} tix`;
    return table;
}

function updateTable(deck) {
    const tables = document.getElementById('priceTables');
    const oldTable = document.getElementById(deck.name);
    const newTable = deckToTable(deck);

    if(oldTable) oldTable.parentElement.replaceChild(newTable, oldTable);
    else tables.insertBefore(newTable, tables.firstChild)
}
