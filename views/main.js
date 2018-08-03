function addEventListenerPromise(target, type, listener) {
    return new Promise((res, rej) => target.addEventListener(type, (e) => res(listener(e))));
}

async function calcTextDecklist(str, doFetch, date) {
    return (new Decklist()).convertFromJSON(await fetch(`/calc?decklist=${encodeURIComponent(str)}&fetch=${doFetch}&date=${date.toISOString()}`).then((r) => r.json()));
}

async function calcAllDecks(decks, doFetch, date) {
    const fd = new FormData();

    for(const deck of decks) fd.append('decks', deck.convertToJSON());
    fd.append('fetch', doFetch);
    fd.append('date', date.toISOString());

    let decks_json = await fetch(`/calc`, {method: 'POST', body: fd}).then((r) => r.json());

    return decks_json.map((json) => (new DeckWithDate()).convertFromJSON(json));

}

document.addEventListener('DOMContentLoaded', load);

function load() {
    let decks = [];

    const dl_form = document.getElementById('decklist_form');
    const dl_text = dl_form.decklist_text;
    const dl_files = dl_form.decklist_files;

    const chkbox = document.getElementById('fetch');
    const base = document.getElementById('date');
    const cachedDate = new Date(2018, 6, 20)

    dl_text.value = localStorage.getItem('decklist_text') || '';

    dl_files.addEventListener('change', readDeckFromFile);

    async function readDeckFromFile() {
        const doFetch = chkbox.checked;
        const date = doFetch?base.value == ""?new Date():new Date(base.value):cachedDate;
        decks = await Promise.all(Array.from(dl_files.files).map((file) => {
            const reader = new FileReader();
            let p = addEventListenerPromise(reader, 'load', async (e) => {
                updateTable(new DeckWithDate(file.name, await calcTextDecklist(reader.result, doFetch, date), date));
                return new Deck(file.name, new Decklist(reader.result));
            });
            reader.readAsText(file);
            return p;
        }));
    }


    const calc_button = document.getElementById('calc');
    calc_button.addEventListener('click', async (e) => {
        const doFetch = chkbox.checked;
        const date = doFetch?base.value == ""?new Date():new Date(base.value):cachedDate;
        updateTable(new DeckWithDate('text', await calcTextDecklist(dl_text.value, doFetch, date), date));
        let decksWithPrice = await calcAllDecks(decks, doFetch, date);
        decksWithPrice.map((d) => updateTable(d));

        localStorage.setItem('decklist_text', dl_text.value);
    });

    const reload_button = document.getElementById('reload');
    reload_button.addEventListener('click', readDeckFromFile);

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

    const totalPrice = mainPrice + sidePrice;
    table.createCaption();
    const date = `${deck.date.getFullYear()}-${deck.date.getMonth() + 1}-${deck.date.getDate()}`;
    table.caption.innerText = `${deck.name} total ${totalPrice.toFixed(3)} tix (${date})`;
    return table;
}

function updateTable(deck) {
    const tables = document.getElementById('priceTables');
    const oldTable = document.getElementById(deck.name);
    const newTable = deckToTable(deck);

    if(oldTable) oldTable.parentElement.replaceChild(newTable, oldTable);
    else tables.insertBefore(newTable, tables.firstChild)
}
