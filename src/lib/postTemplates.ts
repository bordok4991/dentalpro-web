import type { Locale, PostKind } from './types';

/**
 * Predlošci za novosti i savjete. Doktor ih pregleda i prilagodi prije objave;
 * dijelovi u [uglastim zagradama] moraju se popuniti, inače objava nije moguća.
 */
export interface PostTemplate {
  id: string;
  kind: PostKind;
  title: string;
  body: string;
}

const BS: PostTemplate[] = [
  {
    id: 'pranje',
    kind: 'savjet',
    title: 'Kako pravilno prati zube',
    body: `Zube perite dva puta dnevno, ujutro i navečer prije spavanja, po dvije minute.

Koristite mekanu četkicu i pastu s fluorom. Odraslima je dovoljna količina paste veličine zrna graška; djeci do tri godine tek tanak sloj, veličine zrna riže.

Četkicu držite pod uglom od oko 45 stepeni prema desni i perite kratkim, nježnim pokretima. Prođite sve površine: vanjsku, unutrašnju i žvačnu. Na kraju očetkajte i jezik.

Nakon pranja ispljunite višak paste, ali usta nemojte odmah ispirati vodom. Tako fluor duže ostaje na zubima.

Prostor između zuba četkica ne dohvata. Jednom dnevno koristite zubni konac ili interdentalne četkice; na pregledu ćemo vam pokazati koja veličina vam odgovara.

Četkicu mijenjajte svaka tri mjeseca, ili ranije ako se vlakna raščupaju.`,
  },
  {
    id: 'vadjenje',
    kind: 'savjet',
    title: 'Nakon vađenja zuba',
    body: `Gazu koju ste dobili čvrsto držite zagrizenu 30 do 45 minuta. Ako krvarenje nastavi, stavite novu čistu gazu i ponovo zagrizite.

Prvih 24 sata ne ispirajte usta, ne pijte na slamku i ne pušite. Tako se ugrušak u rani ne pomjera, a on je prirodni "zavoj" koji omogućava zarastanje.

Dok anestezija traje, ne jedite i ne pijte vruće napitke, da se ne ugrizete ili opečete.

Prvi dan možete stavljati hladan oblog na obraz, po 15 do 20 minuta s pauzama. Jedite mekanu, mlaku hranu i žvačite na drugoj strani.

Od drugog dana usta nježno ispirajte mlakom slanom vodom, posebno nakon jela. Zube perite normalno, ali oprezno oko rane.

Lijekove protiv bolova uzimajte kako vam je doktor preporučio.

Javite nam se ako krvarenje ne prestaje, ako dobijete temperaturu, ako otok raste nakon trećeg dana ili ako se bol pojača dva do četiri dana nakon vađenja.`,
  },
  {
    id: 'plomba',
    kind: 'savjet',
    title: 'Nakon plombe',
    body: `Bijela (kompozitna) plomba stvrdne odmah u ordinaciji, pa možete jesti čim prođe anestezija. Do tada ne jedite, da se ne ugrizete za obraz ili jezik.

Nekoliko dana zub može biti osjetljiv na hladno i slatko. To je uobičajeno i prolazi samo od sebe.

Ako vam se čini da je plomba "visoka", odnosno da zub prvi dodiruje pri zagrizu, javite se. Ispravka traje kratko, a sprječava bol i pucanje plombe.

Plombu čuvajte kao i svoje zube: redovno pranje, konac i kontrola.`,
  },
  {
    id: 'izbjeljivanje',
    kind: 'savjet',
    title: 'Nakon izbjeljivanja zuba',
    body: `Prvih 48 sati zubi lakše upijaju boju. U tom periodu izbjegavajte kafu, čaj, crno vino, gazirane napitke u boji, cveklu, borovnice i jake začine poput kurkume. Ne pušite.

Prolazna osjetljivost zuba nakon izbjeljivanja je česta. Pasta za osjetljive zube može pomoći.

Rezultat najduže traje uz redovno pranje i čišćenje kamenca u ordinaciji.`,
  },
  {
    id: 'kontrola',
    kind: 'savjet',
    title: 'Zašto su redovni pregledi važni',
    body: `Karijes i upala desni u početku obično ne bole. Na pregledu ih otkrijemo dok je liječenje kratko, jednostavno i jeftinije.

Preporučujemo pregled i čišćenje kamenca svakih šest mjeseci, ili onako kako vam doktor savjetuje.

Javite se i ranije ako primijetite krvarenje desni pri pranju, osjetljivost na hladno ili toplo, bol pri žvakanju ili neprijatan zadah koji ne prolazi.

Termin za pregled možete zakazati u ovoj aplikaciji.`,
  },
  {
    id: 'popust',
    kind: 'novost',
    title: '[Povod]: [postotak]% popusta na [uslugu]',
    body: `Povodom [povod] od [datum početka] do [datum završetka] nudimo [postotak]% popusta na [uslugu].

Termin zakažite u aplikaciji ili pozivom na [broj telefona].

Popust se ne kombinuje s drugim akcijama.`,
  },
  {
    id: 'praznici',
    kind: 'novost',
    title: 'Radno vrijeme za praznike',
    body: `Ordinacija ne radi od [datum] do [datum].

Od [datum] radimo po uobičajenom radnom vremenu.

Za hitne slučajeve u tom periodu: [uputa ili broj telefona].`,
  },
];

const EN: PostTemplate[] = [
  {
    id: 'pranje',
    kind: 'savjet',
    title: 'How to brush your teeth properly',
    body: `Brush twice a day, in the morning and before bed, for two minutes.

Use a soft brush and fluoride toothpaste. Adults need a pea-sized amount; children under three only a thin smear, the size of a grain of rice.

Hold the brush at about 45 degrees towards the gum and use short, gentle strokes. Clean every surface: outer, inner and chewing. Finish by brushing your tongue.

After brushing, spit out the excess paste but do not rinse with water straight away. This keeps the fluoride on your teeth for longer.

A brush cannot reach between the teeth. Use floss or interdental brushes once a day; we will show you which size suits you at your check-up.

Replace your brush every three months, or sooner if the bristles splay.`,
  },
  {
    id: 'vadjenje',
    kind: 'savjet',
    title: 'After a tooth extraction',
    body: `Bite firmly on the gauze for 30 to 45 minutes. If bleeding continues, place a fresh clean gauze and bite again.

For the first 24 hours do not rinse your mouth, do not drink through a straw and do not smoke. This keeps the blood clot in place, which is the natural dressing that lets the wound heal.

While the anaesthetic lasts, do not eat or have hot drinks, so you do not bite or burn yourself.

On the first day you can hold a cold compress against your cheek for 15 to 20 minutes at a time, with breaks. Eat soft, lukewarm food and chew on the other side.

From the second day, rinse gently with lukewarm salt water, especially after meals. Brush as usual, but carefully around the wound.

Take painkillers as your dentist advised.

Contact us if bleeding does not stop, if you develop a fever, if swelling grows after the third day, or if the pain gets worse two to four days after the extraction.`,
  },
  {
    id: 'plomba',
    kind: 'savjet',
    title: 'After a filling',
    body: `A white (composite) filling sets right away in the surgery, so you can eat as soon as the anaesthetic wears off. Until then, do not eat, so you do not bite your cheek or tongue.

For a few days the tooth may be sensitive to cold and sweet. This is normal and settles on its own.

If the filling feels "high", meaning the tooth touches first when you bite, contact us. Adjusting it takes only a moment and prevents pain and a cracked filling.

Look after your filling as you do your teeth: regular brushing, flossing and check-ups.`,
  },
  {
    id: 'izbjeljivanje',
    kind: 'savjet',
    title: 'After teeth whitening',
    body: `For the first 48 hours teeth take up colour more easily. During that time avoid coffee, tea, red wine, coloured fizzy drinks, beetroot, blueberries and strong spices such as turmeric. Do not smoke.

Temporary sensitivity after whitening is common. A toothpaste for sensitive teeth can help.

The result lasts longest with regular brushing and professional cleaning.`,
  },
  {
    id: 'kontrola',
    kind: 'savjet',
    title: 'Why regular check-ups matter',
    body: `Decay and gum inflammation usually do not hurt at first. At a check-up we find them while treatment is short, simple and less costly.

We recommend a check-up and scale-and-polish every six months, or as your dentist advises.

Come in sooner if you notice bleeding gums when brushing, sensitivity to hot or cold, pain when chewing, or bad breath that does not go away.

You can book a check-up in this app.`,
  },
  {
    id: 'popust',
    kind: 'novost',
    title: '[Occasion]: [percent]% off [treatment]',
    body: `For [occasion], from [start date] to [end date], we offer [percent]% off [treatment].

Book in the app or call [phone number].

This offer cannot be combined with other promotions.`,
  },
  {
    id: 'praznici',
    kind: 'novost',
    title: 'Holiday opening hours',
    body: `The practice is closed from [date] to [date].

From [date] we are open as usual.

For emergencies during this period: [instructions or phone number].`,
  },
];

export function postTemplates(locale: Locale, kind: PostKind): PostTemplate[] {
  return (locale === 'en' ? EN : BS).filter((t) => t.kind === kind);
}
