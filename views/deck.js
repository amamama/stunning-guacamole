class JSONConvertable {
    convertToJSONString() {
        return JSON.stringify(this);
    }

    convertToJSON() {
        return JSON.parse(this.convertToJSONString());
    }

    convertFromJSON(json) {
        if(!json) return this;
        for(const k in this) this[k] = json[k];
        return this;
    }
}

class CardFace extends JSONConvertable {
    constructor(name, manaCost, cmc, type, oracle, colors, colorId) {
        this.name = name;
        this.manaCost = manaCost;
        this.cmc = cmc;
        this.type = type;
        this.oracle = oracle;
        this.colors = colors;
        this.colorId = colorId;
    }
}

class Card extends JSONConvertable {
    constructor(name, number) {
        super(); //for super class. its redundant
        this.name = name;
        this.number = number || 1;
    }
}

class CardWithPrice extends Card {
    constructor(name, number, price, cardFaces) {
        super(name, number);
        this.price = price;
        this.price_sum = price * this.number;
        this.cardFaces = cardFaces;
    }
}

class Decklist extends JSONConvertable {

    static parseDecklist(str) {
        try {
            // <?xml version="1.0" encoding="utf-8"?>
            if(str.startsWith('<?xml')) return parseXML();
            // Card Name,Quantity,ID #,Rarity,Set,Collector #,Premium,Sideboarded,
            if(str.startsWith('Card')) return parseCSV();
            // other
            return parseTXT();
        }
        catch(e) {
            console.log(e);
            return new Decklist([], []);
        }

        function parseXML() {
            parseXMLDecl();
            return parseDeck();

            function parseXMLDecl() {
                consume('<?', /xml|XML/);
                if(isNextToken('version')) consume('version', '=', '"', /\d+(\.\d+)?/, '"');
                if(isNextToken('encoding')) consume('encoding', '=', '"', 'utf-8', '"');
                consume('?>');
            }

            function parseDeck() {
                consume('<', 'Deck', /[^>]*/, '>');
                consume('<', 'NetDeckID', '>', /\d+/, '</', 'NetDeckID', '>');
                consume('<', 'PreconstructedDeckID', '>', /\d+/, '</', 'PreconstructedDeckID', '>');

                const main = [], side = [];
                while(isNextToken('<Card')) {
                    parseCard();
                }

                consume('</', 'Deck', /[^>]*/, '>');

                return new Decklist(main, side);

                function parseCard() {
                    consume('<', 'Cards', 'CatID', '=', '"', /\d+/, '"', 'Quantity', '=', '"');
                    const num = parseInt(getToken(/\d+/));
                    consume('"', 'Sideboard', '=', '"');
                    const isMain = getToken(/true|false/i).toLowerCase() == 'false';
                    consume('"', 'Name', '=', '"');
                    const name = getToken(/[^"]+/).replace(/&quot;/g, '"');
                    consume ('"', '/>');

                    const card = new Card(name, num);
                    (isMain?main:side).push(card);
                }
            }

            function consume() {
                for(const arg of arguments) {
                    getToken(arg);
                }
            }

            function getToken(regexp) {
                str = str.trimLeft();
                if(typeof(regexp) == 'string') {
                    if(!str.startsWith(regexp)) throw `parseXML Error expected:"${regexp}" at:${str}`;
                    str = str.substr(regexp.length);
                    return regexp;
                } else {
                    const result = str.match(regexp);
                    if(result.index != 0) throw `parseXML Error expected:${regexp} at:${str}`;
                    str = str.substr(result[0].length);
                    return result[0];
                }
            }

            function isNextToken(regexp) {
                str = str.trimLeft();
                if(typeof(regexp) == 'string') return str.startsWith(regexp);
                const result = str.match(regexp);
                return result.index == 0;
            }
        }

        function parseCSV() {
            const table = str.split(/(?:\r\n|\r|\n)+/).map((s) => parseLine(s));
            const colName = table.shift();
            const nameIdx = colName.indexOf('Card Name'), quaIdx = colName.indexOf('Quantity'), sideIdx = colName.indexOf('Sideboarded');
            const main = [], side = [];
            for(const line of table) {
                if(line.length == 0) continue;
                const name = line[nameIdx];
                const num = parseInt(line[quaIdx]);
                const isMain = line[sideIdx] == 'No';
                const card = new Card(name, num);
                (isMain?main:side).push(card);
            }

            return new Decklist(main, side);

            // line := eps | ('"' ([^"]|"(?!,))* '",' | [^,]* ',')* | ('"' ([^"]|"(?!,))* '"' | [^,]*)
            function parseLine(str) {
                if(/^$/.test(str)) return [];

                const line = [];
                do {
                    let value = '';

                    if(str.startsWith('"')) {
                        str = str.substr(1);
                        value = str.match(/([^"]|"(?!,))*/)[0];
                        str = str.substr(value.length);
                        if(!str.startsWith('"')) throw `ParseLine Error at: ${str}`;
                        str = str.substr(1);
                    } else {
                        value = str.match(/[^,]*/)[0];
                        str = str.substr(value.length);
                    }
                    line.push(value);

                    str.trimLeft();
                    if(str.startsWith(',')) str = str.substr(1);
                } while(!/^$/.test(str));

                return line;
            }
        }

        function parseTXT() {
            const lines = str.split(/\r\n|\n/);
            const main = [], side = [];
            for(let i = 0, isMain = true; i < lines.length; i++) {
                if(/^(?:(?:S|s)ideboard)?$/.test(lines[i])) {
                    isMain = false;
                    continue;
                }
                const result = lines[i].match(/^(\d+)\s+(.*)$/);
                const name = result[2], num = result[1];
                const card = new Card(name, num);
                (isMain?main:side).push(card);
            }

            return new Decklist(main, side);
        }

    }

    constructor(main, side) {
        super(); //for super class. its redundant
        this.main = main;
        this.sideboard = side;
    }

    convertFromJSON(json) {
        super.convertFromJSON(json);
        this.main = this.main.map(convertCard);
        this.sideboard = this.sideboard.map(convertCard);
        function convertCard(json) {
            if(!json) return null;
            if('price' in json) return (new CardWithPrice()).convertFromJSON(json);
             return (new Card()).convertFromJSON(json);
        }
        return this;
    }
}

class Deck extends JSONConvertable {
    constructor(name, decklist) {
        super(); //for super class. its redundant
        this.name = name;
        this.decklist = decklist;
    }

    convertFromJSON(json) {
        super.convertFromJSON(json);
        this.decklist = (new Decklist()).convertFromJSON(this.decklist);
        return this;
    }
}

class DeckWithDate extends Deck {
    constructor(name, decklist, date = new Date()) {
        super(name, decklist);
        this.date = date;
    }

    convertFromJSON(json) {
        super.convertFromJSON(json);
        this.date = new Date(this.date);
        return this;
    }
}

if(typeof module !== 'undefined')
module.exports = {
    CardFace,
    Card,
    CardWithPrice,
    Decklist,
    Deck,
    DeckWithDate
};
