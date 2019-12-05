const searchForm = document.querySelector('#search-form');
const movie =document.querySelector('#movies');
function apiSearch(event) {
    event.preventDefault();
    const searchText = document.querySelector('.form-control').value;
    const server = 'https://api.themoviedb.org/3/search/multi?api_key=ddd303084d05c0b61b51d539910ef146&language=ru&query=' + searchText;
    requestApi('GET', server);
}

searchForm.addEventListener('submit', apiSearch);


//подключаемся к Api
function requestApi(method, url) {

    const request = new XMLHttpRequest();
    //console.log(request);
    request.open(method, url);
    request.send();

    request.addEventListener('readystatechange', () =>{
        if (request.readyState !== 4) return;

        if(request.status !==200){
            console.log('error:' + request.status);
            return;
        }
        //спарсит JSON в объект
        const output = JSON.parse(request.responseText);

        let inner = '';

        //вывод результата
        output.results.forEach(function(item){
            // выведит значение которое существует
            let nameItem = item.name || item.title;
            console.log(nameItem);
            //add верстку к пустой строке
            inner += `<div class="col-12">${nameItem} + </div>`;
        });

        movie.innerHTML = inner;

        console.log(output);
    });
}