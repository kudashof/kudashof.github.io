const searchForm = document.querySelector('#search-form');
const movie = document.querySelector('#movies');

function apiSearch(event) {
    event.preventDefault();
    const searchText = document.querySelector('.form-control').value;
    const server = 'https://api.themoviedb.org/3/search/multi?api_key=ddd303084d05c0b61b51d539910ef146&language=ru&query=' + searchText;
    movie.innerHTML = 'Загрузка . . .';
    requestApi(server)

        .then(function (result) {
            //спарсит JSON в объект
            const output = JSON.parse(result);
            let inner = '';

            //вывод результата
            output.results.forEach(function (item) {
                // выведит значение которое существует
                let nameItem = item.name || item.title;
                //add адаптив верстку к пустой строке
                inner += `<div class="col-12 col-md-4 col-xl-3">${nameItem}ddd</div>`;
            });

            movie.innerHTML = inner;
            console.log(output);
        })
        .catch(function (reason) {
            movie.innerHTML = 'Упс, что то пошло не так!';
            console.log('error:' + reason.status);
        })
    ;
}

searchForm.addEventListener('submit', apiSearch);


//подключаемся к Api
function requestApi(url) {
    return new Promise(function (resolve, reject) {
        const request = new XMLHttpRequest();
        request.open('GET', url);

        request.addEventListener('load', function () {
            console.log('error');
            if (request.status !== 200) {
                reject({
                    status: request.status
                });
                return;
            }
            //Выполнелся успешно и передает результат
            resolve(request.response);
        });
        request.addEventListener('error', function () {
            //выполнился с ошибкой. 404 не обрабатывается error
            reject({
                status: request.status
            });
        });
        request.send();
    });
}


// request.addEventListener('readystatechange', () =>{
//     if (request.readyState !== 4) {
//         movie.innerHTML = 'Загрузка';
//         return;
//     }
//
//     if(request.status !==200){
//         movie.innerHTML = 'Упс, что то пошло не так!';
//         console.log('error:' + request.status);
//         return;
//     }
//      спарсит JSON в объект
//     const output = JSON.parse(request.responseText);
//
//     let inner = '';
//
//     //вывод результата
//     output.results.forEach(function(item){
//         // выведит значение которое существует
//         let nameItem = item.name || item.title;
//         console.log(nameItem);
//         //add адаптив верстку к пустой строке
//         inner += `<div class="col-12 col-md-4 col-xl-3">${nameItem} + </div>`;
//     });
//
//     movie.innerHTML = inner;
//
//     console.log(output);
// });
