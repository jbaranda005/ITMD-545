
const button = document.querySelector('#test-button');
const body = document.querySelector('body');
body.addEventListener('click', function(event){
  const el = event.target;
  console.log('Someone clicked somethings!');
  console.log('Clicked Class:', el.className);
  if (event.target.id == 'test-button'){
      console.log('Clicked element name:', el.tagName);
  }

});

console.log('one');
setTimeout(function (){
  console.log('two');
  button.dispatchEvent(generateCustomEvent('__ready'));
}, 1000)
console.log('three');

function generateCustomEvent(event_name) {
  return new Event(event_name);
}
